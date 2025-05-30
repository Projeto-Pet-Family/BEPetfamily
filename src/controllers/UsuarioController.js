const sqlconnection = require('../connections/SQLConnections.js');

async function lerUsuarios(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Usuario');
        res.status(200).send(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os usuários, confira o console'
        });
        console.log(error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarUsuarioPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idUsuario } = req.params;
        const [result] = await sql.query('SELECT * FROM Usuario WHERE idUsuario = ?', [idUsuario]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        res.status(200).send(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar o usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function inserirUsuario(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            nome, 
            cpf, 
            email,
            telefone,
            senha,
            ativado = false,
            desativado = false,
            esqueceuSenha = false,
            dataCadastro = new Date()
        } = req.body;

        const [existingUser] = await sql.query(
            'SELECT * FROM Usuario WHERE cpf = ? OR email = ?', 
            [cpf, email]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                message: 'Já existe um usuário com este CPF ou Email'
            });
        }

        const [result] = await sql.query(
            'INSERT INTO Usuario (nome, cpf, email, telefone, senha, ativado, desativado, esqueceuSenha, dataCadastro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nome, cpf, email, telefone, senha, ativado, desativado, esqueceuSenha, dataCadastro]
        );

        const novoUsuario = {
            idUsuario: result.insertId,
            nome,
            cpf,
            email,
            telefone,
            ativado,
            desativado,
            esqueceuSenha,
            dataCadastro
        };

        res.status(201).json({
            message: 'Usuário criado com sucesso!',
            data: novoUsuario
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar o usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarUsuario(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
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

        const [user] = await sql.query('SELECT * FROM Usuario WHERE idUsuario = ?', [idUsuario]);
        
        if (user.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const updateFields = {};
        const updateValues = [];

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
            setClauses.push(`${key} = ?`);
            updateValues.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idUsuario = ?';
        updateValues.push(idUsuario);

        await sql.query(query, updateValues);

        const [updatedUser] = await sql.query('SELECT * FROM Usuario WHERE idUsuario = ?', [idUsuario]);

        res.status(200).json({
            message: 'Usuário atualizado com sucesso',
            data: updatedUser[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirUsuario(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idUsuario } = req.params;

        const [user] = await sql.query('SELECT * FROM Usuario WHERE idUsuario = ?', [idUsuario]);
        
        if (user.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        await sql.query('DELETE FROM Usuario WHERE idUsuario = ?', [idUsuario]);

        res.status(200).json({
            message: 'Usuário deletado com sucesso!',
            deletedUser: user[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerUsuarios,
    buscarUsuarioPorId,
    inserirUsuario,
    atualizarUsuario,
    excluirUsuario,
};