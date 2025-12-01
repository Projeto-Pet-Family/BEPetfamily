const pool = require('../../connections/SQLConnections.js');
const bcrypt = require('bcrypt');
const { inserirPetPadraoAoRegistrar } = require('../pet/PetController.js')

async function lerUsuarios(req, res) {
    let client;

    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM Usuario');
        res.status(200).send(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os usuários, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function buscarUsuarioPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        const result = await client.query('SELECT * FROM Usuario WHERE idUsuario = $1', [idUsuario]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        res.status(200).send(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar o usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function inserirUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();

        const { 
            nome, 
            cpf, 
            email,
            telefone,
            senha,
            esqueceuSenha = false,
            dataCadastro = new Date(),
            petData = {}
        } = req.body;

        console.log('📦 Dados recebidos do frontend:');
        console.log('👤 Usuário:', { nome, cpf, email });
        console.log('🐾 Pet Data:', petData);

        // Validações básicas do usuário
        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome do usuário é obrigatório'
            });
        }

        if (!cpf || cpf.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'CPF é obrigatório'
            });
        }

        if (!email || email.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Email é obrigatório'
            });
        }

        if (!senha || senha.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Senha é obrigatória'
            });
        }

        // Hash da senha
        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);

        // Iniciar transação
        await client.query('BEGIN');

        // Inserir usuário
        const userResult = await client.query(
            `INSERT INTO Usuario 
             (nome, cpf, email, telefone, senha, esqueceuSenha, dataCadastro) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING idUsuario, nome, email, cpf, telefone, dataCadastro`,
            [nome.trim(), cpf.trim(), email.trim(), telefone?.trim(), senhaHash, esqueceuSenha, dataCadastro]
        );

        const novoUsuario = userResult.rows[0];
        const idUsuario = novoUsuario.idusuario;

        console.log(`✅ Usuário criado com ID: ${idUsuario}`);

        // Processar petData se existir
        let petCriado = null;
        
        if (petData && Object.keys(petData).length > 0) {
            console.log(`🔄 Processando dados do pet para usuário ID: ${idUsuario}`);
            
            try {
                // Validações do pet
                const errors = [];
                
                if (!petData.nome || petData.nome.trim() === '') {
                    errors.push('Nome do pet é obrigatório');
                }
                
                if (!petData.sexo || petData.sexo.trim() === '') {
                    errors.push('Sexo do pet é obrigatório');
                } else if (!['M', 'F', 'm', 'f'].includes(petData.sexo.trim())) {
                    errors.push('Sexo do pet deve ser "M" ou "F"');
                }
                
                if (errors.length > 0) {
                    console.log('❌ Erros de validação do pet:', errors);
                    // Não fazemos rollback, apenas ignora o pet e continua com usuário
                    console.log('ℹ️ Criando apenas usuário (sem pet) devido a erros de validação');
                } else {
                    // Preparar dados do pet
                    const petNome = petData.nome.trim();
                    const petSexo = petData.sexo.trim().toUpperCase();
                    const petIdPorte = petData.idPorte && petData.idPorte > 0 ? petData.idPorte : null;
                    const petIdEspecie = petData.idEspecie && petData.idEspecie > 0 ? petData.idEspecie : null;
                    const petIdRaca = petData.idRaca && petData.idRaca > 0 ? petData.idRaca : null;
                    const petObservacoes = petData.observacoes ? petData.observacoes.trim() : null;

                    console.log(`🔍 Dados finais do pet:`);
                    console.log(`   👤 ID Usuário: ${idUsuario}`);
                    console.log(`   🐾 Nome: ${petNome}`);
                    console.log(`   ⚧️ Sexo: ${petSexo}`);
                    console.log(`   📏 Porte ID: ${petIdPorte}`);
                    console.log(`   🐶 Espécie ID: ${petIdEspecie}`);
                    console.log(`   🐕 Raça ID: ${petIdRaca}`);
                    console.log(`   📝 Observações: ${petObservacoes}`);

                    // Inserir pet diretamente
                    const petQuery = `
                        INSERT INTO Pet 
                        (idusuario, idporte, idespecie, idraca, nome, sexo, observacoes) 
                        VALUES ($1, $2, $3, $4, $5, $6, $7) 
                        RETURNING idpet, nome, sexo, idporte, idespecie, idraca, observacoes
                    `;

                    const petResult = await client.query(petQuery, [
                        idUsuario,
                        petIdPorte,
                        petIdEspecie,
                        petIdRaca,
                        petNome,
                        petSexo,
                        petObservacoes
                    ]);

                    petCriado = petResult.rows[0];
                    console.log('✅ Pet criado com sucesso:', {
                        idPet: petCriado.idpet,
                        nome: petCriado.nome,
                        sexo: petCriado.sexo
                    });

                    // Adiciona info do pet na resposta
                    novoUsuario.petCriado = {
                        idPet: petCriado.idpet,
                        nome: petCriado.nome,
                        sexo: petCriado.sexo,
                        idPorte: petCriado.idporte,
                        idEspecie: petCriado.idespecie,
                        idRaca: petCriado.idraca
                    };
                }
            } catch (petError) {
                console.error('❌ Erro ao criar pet:', petError);
                
                // Se for erro de chave estrangeira, tenta criar sem as FKs
                if (petError.code === '23503') {
                    console.log('🔄 Tentando criar pet sem FKs devido a erro de chave estrangeira...');
                    
                    try {
                        const petNome = petData.nome.trim();
                        const petSexo = petData.sexo.trim().toUpperCase();
                        const petObservacoes = petData.observacoes ? petData.observacoes.trim() : null;

                        const petQuery = `
                            INSERT INTO Pet 
                            (idusuario, nome, sexo, observacoes) 
                            VALUES ($1, $2, $3, $4) 
                            RETURNING idpet, nome, sexo, observacoes
                        `;

                        const petResult = await client.query(petQuery, [
                            idUsuario,
                            petNome,
                            petSexo,
                            petObservacoes
                        ]);

                        petCriado = petResult.rows[0];
                        console.log('✅ Pet criado (sem FKs) com sucesso:', petCriado);

                        novoUsuario.petCriado = {
                            idPet: petCriado.idpet,
                            nome: petCriado.nome,
                            sexo: petCriado.sexo
                        };
                    } catch (secondError) {
                        console.error('❌ Erro também na segunda tentativa:', secondError);
                        // Ainda assim não fazemos rollback - usuário foi criado
                    }
                } else {
                    // Para outros erros, apenas log e continua
                    console.error('❌ Erro não tratado ao criar pet, continuando com usuário...');
                }
            }
        } else {
            console.log('ℹ️ Nenhum dado de pet fornecido');
        }

        // Commit da transação
        await client.query('COMMIT');

        const response = {
            success: true,
            message: 'Usuário criado com sucesso!' + (novoUsuario.petCriado ? ' e pet cadastrado!' : ''),
            data: {
                usuario: novoUsuario,
                idusuario: novoUsuario.idusuario 
            }
        };

        res.status(201).json(response);

    } catch (error) {
        // Rollback em caso de erro
        if (client) {
            await client.query('ROLLBACK');
        }

        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'CPF ou email já cadastrado'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Erro ao criar o usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function atualizarUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;

        const {
            nome = null,
            cpf = null,
            email = null,
            telefone = null,
            senha = null,
            esqueceuSenha = null
        } = req.body;

        const userResult = await client.query('SELECT * FROM Usuario WHERE idUsuario = $1', [idUsuario]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const updateFields = {};
        const updateValues = [];
        let paramCount = 1;

        if (nome !== null) { updateFields.nome = nome; }
        if (cpf !== null) { updateFields.cpf = cpf; }
        if (email !== null) { updateFields.email = email; }
        if (telefone !== null) { updateFields.telefone = telefone; }
        if (senha !== null) { updateFields.senha = senha; }
        if (esqueceuSenha !== null) { updateFields.esqueceuSenha = esqueceuSenha; }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Usuario SET ';
        const setClauses = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = $${paramCount}`);
            updateValues.push(value);
            paramCount++;
        }
        
        query += setClauses.join(', ');
        query += ` WHERE idUsuario = $${paramCount} RETURNING *`;
        updateValues.push(idUsuario);

        const result = await client.query(query, updateValues);

        res.status(200).json({
            message: 'Usuário atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para duplicados
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'CPF ou email já cadastrado'
            });
        }

        res.status(500).json({
            message: 'Erro ao atualizar usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function excluirUsuario(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idUsuario } = req.params;

        const userResult = await client.query('SELECT * FROM Usuario WHERE idUsuario = $1', [idUsuario]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const result = await client.query(
            'DELETE FROM Usuario WHERE idUsuario = $1 RETURNING *',
            [idUsuario]
        );

        res.status(200).json({
            message: 'Usuário deletado com sucesso!',
            deletedUser: result.rows[0]
        });

    } catch (error) {
        // Tratamento para chave estrangeira
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível excluir o usuário pois está vinculado a outros registros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

module.exports = {
    lerUsuarios,
    buscarUsuarioPorId,
    inserirUsuario,
    atualizarUsuario,
    excluirUsuario
};