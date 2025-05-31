const sqlconnection = require('../../connections/SQLConnections.js');

async function listarCargos(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Cargo ORDER BY descricao');
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar cargos',
            error: error.message
        });
        console.error('Erro ao listar cargos:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarCargoPorId(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idCargo } = req.params;
        
        const [result] = await sql.query('SELECT * FROM Cargo WHERE idCargo = ?', [idCargo]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Cargo não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar cargo',
            error: error.message
        });
        console.error('Erro ao buscar cargo:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarCargo(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { descricao } = req.body;

        // Validação
        if (!descricao || descricao.trim().length === 0) {
            return res.status(400).json({
                message: 'Descrição do cargo é obrigatória'
            });
        }

        if (descricao.length > 20) {
            return res.status(400).json({
                message: 'Descrição deve ter no máximo 20 caracteres'
            });
        }

        const [result] = await sql.query(
            'INSERT INTO Cargo (descricao) VALUES (?)',
            [descricao.trim()]
        );

        const [novoCargo] = await sql.query('SELECT * FROM Cargo WHERE idCargo = ?', [result.insertId]);

        res.status(201).json({
            message: 'Cargo criado com sucesso',
            data: novoCargo[0]
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um cargo com esta descrição'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar cargo',
            error: error.message
        });
        console.error('Erro ao criar cargo:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarCargo(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idCargo } = req.params;
        const { descricao } = req.body;

        // Validação
        if (!descricao || descricao.trim().length === 0) {
            return res.status(400).json({
                message: 'Descrição do cargo é obrigatória'
            });
        }

        if (descricao.length > 20) {
            return res.status(400).json({
                message: 'Descrição deve ter no máximo 20 caracteres'
            });
        }

        // Verificar se o cargo existe
        const [cargo] = await sql.query('SELECT * FROM Cargo WHERE idCargo = ?', [idCargo]);
        if (cargo.length === 0) {
            return res.status(404).json({ message: 'Cargo não encontrado' });
        }

        await sql.query(
            'UPDATE Cargo SET descricao = ? WHERE idCargo = ?',
            [descricao.trim(), idCargo]
        );

        const [cargoAtualizado] = await sql.query('SELECT * FROM Cargo WHERE idCargo = ?', [idCargo]);

        res.status(200).json({
            message: 'Cargo atualizado com sucesso',
            data: cargoAtualizado[0]
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um cargo com esta descrição'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar cargo',
            error: error.message
        });
        console.error('Erro ao atualizar cargo:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirCargo(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idCargo } = req.params;

        // Verificar se o cargo existe
        const [cargo] = await sql.query('SELECT * FROM Cargo WHERE idCargo = ?', [idCargo]);
        if (cargo.length === 0) {
            return res.status(404).json({ message: 'Cargo não encontrado' });
        }

        // Verificar se há usuários vinculados
        const [usuarios] = await sql.query('SELECT 1 FROM Usuario WHERE idCargo = ? LIMIT 1', [idCargo]);
        if (usuarios.length > 0) {
            return res.status(400).json({
                message: 'Não é possível excluir o cargo pois existem usuários vinculados'
            });
        }

        await sql.query('DELETE FROM Cargo WHERE idCargo = ?', [idCargo]);

        res.status(200).json({
            message: 'Cargo excluído com sucesso',
            data: cargo[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir cargo',
            error: error.message
        });
        console.error('Erro ao excluir cargo:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    listarCargos,
    buscarCargoPorId,
    criarCargo,
    atualizarCargo,
    excluirCargo
};