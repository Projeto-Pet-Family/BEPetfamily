const pool = require('../../connections/SQLConnections.js');
const bcrypt = require('bcrypt');

async function lerHospedagens(req, res) {
    let client;

    try {
        client = await pool.connect();
        
        const query = `
            SELECT 
                h.idHospedagem,
                h.nome,
                h.valor_diaria,
                h.email,
                h.telefone,
                h.cnpj,
                h.datacriacao,
                h.dataatualizacao,
                e.idendereco,
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            ORDER BY h.nome
        `;
        
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar hospedagens',
            error: error.message
        });
        console.error('Erro ao listar hospedagens:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarHospedagemPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idHospedagem } = req.params;
        
        const query = `
            SELECT 
                h."idhospedagem",
                h.nome,
                h.valor_diaria,
                h.email,
                h.telefone,
                h.cnpj,
                h.datacriacao,
                h.dataatualizacao,
                e."idendereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                cep."idcep",
                log.nome as logradouro,
                log."idlogradouro",
                b.nome as bairro,
                b."idbairro",
                cid.nome as cidade,
                cid."idcidade",
                est.nome as estado,
                est.sigla,
                est."idestado"
            FROM Hospedagem h
            JOIN Endereco e ON h."idendereco" = e."idendereco"
            JOIN CEP cep ON e."idcep" = cep."idcep"
            JOIN Logradouro log ON e."idlogradouro" = log."idlogradouro"
            JOIN Bairro b ON log."idbairro" = b."idbairro"
            JOIN Cidade cid ON b."idcidade" = cid."idcidade"
            JOIN Estado est ON cid."idestado" = est."idestado"
            WHERE h."idhospedagem" = $1
        `;
        
        const result = await client.query(query, [idHospedagem]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar hospedagem',
            error: error.message
        });
        console.error('Erro ao buscar hospedagem:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarHospedagem(req, res) {
    let client;

    try {
        client = await pool.connect();

        const { 
            nome,
            idendereco,
            valor_diaria,
            email,
            senha,
            telefone,
            cnpj
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !idendereco || valor_diaria === undefined) {
            return res.status(400).json({
                message: 'Nome, ID do endereço e valor da diária são campos obrigatórios'
            });
        }

        // Validar valor da diária
        if (valor_diaria < 0) {
            return res.status(400).json({
                message: 'O valor da diária não pode ser negativo'
            });
        }

        // Validar email se fornecido
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    message: 'Formato de email inválido'
                });
            }
        }

        // Verificar se o endereço existe
        const endereco = await client.query('SELECT 1 FROM Endereco WHERE "idendereco" = $1', [idendereco]);
        if (endereco.rows.length === 0) {
            return res.status(400).json({
                message: 'Endereço não encontrado'
            });
        }

        // Verificar se email já existe
        if (email) {
            const emailExistente = await client.query('SELECT 1 FROM Hospedagem WHERE email = $1', [email]);
            if (emailExistente.rows.length > 0) {
                return res.status(409).json({
                    message: 'Já existe uma hospedagem cadastrada com este email'
                });
            }
        }

        // Verificar se CNPJ já existe
        if (cnpj) {
            const cnpjExistente = await client.query('SELECT 1 FROM Hospedagem WHERE cnpj = $1', [cnpj]);
            if (cnpjExistente.rows.length > 0) {
                return res.status(409).json({
                    message: 'Já existe uma hospedagem cadastrada com este CNPJ'
                });
            }
        }

        // Hash da senha se fornecida
        let senhaHash = null;
        if (senha) {
            if (senha.length < 6) {
                return res.status(400).json({
                    message: 'A senha deve ter pelo menos 6 caracteres'
                });
            }
            senhaHash = await bcrypt.hash(senha, 10);
        }

        // Inserir no banco de dados
        const result = await client.query(
            `INSERT INTO Hospedagem 
                (nome, idEndereco, valor_diaria, email, senha, telefone, cnpj) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING idHospedagem`,
            [nome, idendereco, valor_diaria, email, senhaHash, telefone, cnpj]
        );

        // Buscar os dados completos da hospedagem criada
        const novaHospedagem = await client.query(`
            SELECT 
                h.idhospedagem,
                h.nome,
                h.valor_diaria,
                h.email,
                h.telefone,
                h.cnpj,
                h.datacriacao,
                h.dataatualizacao,
                e.idendereco,
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            WHERE h.idHospedagem = $1
        `, [result.rows[0].idHospedagem]);

        res.status(201).json({
            message: 'Hospedagem criada com sucesso',
            data: novaHospedagem.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe uma hospedagem com este nome no mesmo endereço'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar hospedagem',
            error: error.message
        });
        console.error('Erro ao criar hospedagem:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarHospedagem(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idHospedagem } = req.params;

        const {
            nome,
            idEndereco,
            valor_diaria,
            email,
            senha,
            telefone,
            cnpj
        } = req.body;

        // Verificar se a hospedagem existe
        const hospedagem = await client.query('SELECT * FROM Hospedagem WHERE "idHospedagem" = $1', [idHospedagem]);
        if (hospedagem.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        // Verificar se o novo endereço existe, se for fornecido
        if (idEndereco) {
            const endereco = await client.query('SELECT 1 FROM Endereco WHERE "idEndereco" = $1', [idEndereco]);
            if (endereco.rows.length === 0) {
                return res.status(400).json({
                    message: 'Endereço não encontrado'
                });
            }
        }

        // Validar valor da diária, se fornecido
        if (valor_diaria !== undefined && valor_diaria < 0) {
            return res.status(400).json({
                message: 'O valor da diária não pode ser negativo'
            });
        }

        // Validar email se fornecido
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    message: 'Formato de email inválido'
                });
            }

            // Verificar se email já existe em outra hospedagem
            const emailExistente = await client.query(
                'SELECT 1 FROM Hospedagem WHERE email = $1 AND "idHospedagem" != $2',
                [email, idHospedagem]
            );
            if (emailExistente.rows.length > 0) {
                return res.status(409).json({
                    message: 'Já existe uma hospedagem cadastrada com este email'
                });
            }
        }

        // Verificar se CNPJ já existe em outra hospedagem
        if (cnpj) {
            const cnpjExistente = await client.query(
                'SELECT 1 FROM Hospedagem WHERE cnpj = $1 AND "idHospedagem" != $2',
                [cnpj, idHospedagem]
            );
            if (cnpjExistente.rows.length > 0) {
                return res.status(409).json({
                    message: 'Já existe uma hospedagem cadastrada com este CNPJ'
                });
            }
        }

        // Hash da senha se fornecida
        let senhaHash = undefined;
        if (senha) {
            if (senha.length < 6) {
                return res.status(400).json({
                    message: 'A senha deve ter pelo menos 6 caracteres'
                });
            }
            senhaHash = await bcrypt.hash(senha, 10);
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (idEndereco) updateFields.idEndereco = idEndereco;
        if (valor_diaria !== undefined) updateFields.valor_diaria = valor_diaria;
        if (email !== undefined) updateFields.email = email;
        if (senhaHash !== undefined) updateFields.senha = senhaHash;
        if (telefone !== undefined) updateFields.telefone = telefone;
        if (cnpj !== undefined) updateFields.cnpj = cnpj;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Hospedagem SET ';
        const setClauses = [];
        const values = [];
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(updateFields)) {
            const columnName = key === 'idEndereco' ? '"idEndereco"' : key;
            setClauses.push(`${columnName} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
        
        // Adicionar data de atualização
        setClauses.push('dataatualizacao = CURRENT_TIMESTAMP');
        
        query += setClauses.join(', ');
        query += ` WHERE "idHospedagem" = $${paramCount}`;
        values.push(idHospedagem);

        await client.query(query, values);

        // Buscar a hospedagem atualizada
        const updatedHospedagem = await client.query(`
            SELECT 
                h."idHospedagem",
                h.nome,
                h.valor_diaria,
                h.email,
                h.telefone,
                h.cnpj,
                h.datacriacao,
                h.dataatualizacao,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            WHERE h."idHospedagem" = $1
        `, [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem atualizada com sucesso',
            data: updatedHospedagem.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe uma hospedagem com este nome no mesmo endereço'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar hospedagem',
            error: error.message
        });
        console.error('Erro ao atualizar hospedagem:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function excluirHospedagem(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idHospedagem } = req.params;

        // Verificar se a hospedagem existe
        const hospedagem = await client.query(`
            SELECT 
                h."idHospedagem",
                h.nome,
                h.valor_diaria,
                h.email,
                h.telefone,
                h.cnpj,
                h.datacriacao,
                h.dataatualizacao,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            WHERE h."idHospedagem" = $1
        `, [idHospedagem]);
        
        if (hospedagem.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        await client.query('DELETE FROM Hospedagem WHERE "idHospedagem" = $1', [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem excluída com sucesso',
            data: hospedagem.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir hospedagem',
            error: error.message
        });
        console.error('Erro ao excluir hospedagem:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// SISTEMA DE LOGIN
async function loginHospedagem(req, res) {
    let client;

    try {
        client = await pool.connect();
        
        const { email, senha } = req.body;

        // Validar campos obrigatórios
        if (!email || !senha) {
            return res.status(400).json({
                message: 'Email e senha são obrigatórios'
            });
        }

        // Buscar hospedagem pelo email
        const result = await client.query(`
            SELECT 
                h."idhospedagem",
                h.nome,
                h.email,
                h.senha,
                h.valor_diaria,
                h.telefone,
                h.cnpj,
                e."idendereco",
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idendereco" = e."idendereco"
            JOIN CEP cep ON e."idcep" = cep."idcep"
            JOIN Logradouro log ON e."idlogradouro" = log."idlogradouro"
            JOIN Bairro b ON log."idbairro" = b."idbairro"
            JOIN Cidade cid ON b."idcidade" = cid."idcidade"
            JOIN Estado est ON cid."idestado" = est."idestado"
            WHERE h.email = $1
        `, [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: 'Email ou senha inválidos'
            });
        }

        const hospedagem = result.rows[0];

        // Verificar se a hospedagem tem senha cadastrada
        if (!hospedagem.senha) {
            return res.status(401).json({
                message: 'Hospedagem não possui senha cadastrada'
            });
        }

        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, hospedagem.senha);
        if (!senhaValida) {
            return res.status(401).json({
                message: 'Email ou senha inválidos'
            });
        }

        // Remover a senha do objeto de resposta
        const { senha: _, ...hospedagemSemSenha } = hospedagem;

        res.status(200).json({
            message: 'Login realizado com sucesso',
            data: hospedagemSemSenha
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao realizar login',
            error: error.message
        });
        console.error('Erro ao realizar login:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Função para alterar senha
async function alterarSenha(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idHospedagem } = req.params;
        const { senhaAtual, novaSenha } = req.body;

        // Validar campos
        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({
                message: 'Senha atual e nova senha são obrigatórias'
            });
        }

        if (novaSenha.length < 6) {
            return res.status(400).json({
                message: 'A nova senha deve ter pelo menos 6 caracteres'
            });
        }

        // Buscar hospedagem
        const result = await client.query(
            'SELECT senha FROM Hospedagem WHERE "idHospedagem" = $1',
            [idHospedagem]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        const hospedagem = result.rows[0];

        // Verificar se a hospedagem tem senha cadastrada
        if (!hospedagem.senha) {
            return res.status(400).json({
                message: 'Hospedagem não possui senha cadastrada'
            });
        }

        // Verificar senha atual
        const senhaAtualValida = await bcrypt.compare(senhaAtual, hospedagem.senha);
        if (!senhaAtualValida) {
            return res.status(401).json({
                message: 'Senha atual inválida'
            });
        }

        // Hash da nova senha
        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

        // Atualizar senha
        await client.query(
            'UPDATE Hospedagem SET senha = $1, dataatualizacao = CURRENT_TIMESTAMP WHERE "idHospedagem" = $2',
            [novaSenhaHash, idHospedagem]
        );

        res.status(200).json({
            message: 'Senha alterada com sucesso'
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao alterar senha',
            error: error.message
        });
        console.error('Erro ao alterar senha:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerHospedagens,
    buscarHospedagemPorId,
    criarHospedagem,
    atualizarHospedagem,
    excluirHospedagem,
    loginHospedagem,
    alterarSenha
};