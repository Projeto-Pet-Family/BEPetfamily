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
            ativado = false,
            desativado = false,
            esqueceuSenha = false,
            dataCadastro = new Date(),
            criarPetPadrao = true // Novo parâmetro opcional
        } = req.body;

        // Hash da senha
        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);

        // Iniciar transação
        await client.query('BEGIN');

        // Inserir usuário
        const userResult = await client.query(
            `INSERT INTO Usuario 
             (nome, cpf, email, telefone, senha, ativado, desativado, esqueceuSenha, dataCadastro) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
             RETURNING idUsuario, nome, email, cpf, telefone, ativado, dataCadastro`,
            [nome, cpf, email, telefone, senhaHash, ativado, desativado, esqueceuSenha, dataCadastro]
        );

        const novoUsuario = userResult.rows[0];

        // Criar pet padrão automaticamente se solicitado
        let petCriado = null;
        if (criarPetPadrao) {
            try {
                petCriado = await inserirPetPadraoAoRegistrar(novoUsuario.idusuario, client);
            } catch (petError) {
                console.warn('Não foi possível criar pet padrão, continuando sem pet:', petError);
                // Não falha a criação do usuário se o pet der erro
            }
        }

        // Commit da transação
        await client.query('COMMIT');

        const response = {
            message: 'Usuário criado com sucesso!',
            data: {
                usuario: novoUsuario,
                pet: petCriado
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
                message: 'CPF ou email já cadastrado'
            });
        }

        res.status(500).json({
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
            ativado = null,
            desativado = null,
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
        if (ativado !== null) { updateFields.ativado = ativado; }
        if (desativado !== null) { updateFields.desativado = desativado; }
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