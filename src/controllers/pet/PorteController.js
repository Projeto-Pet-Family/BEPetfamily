const pool = require('../../connections/SQLConnections.js');

async function lerPorte(req, res) {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM Porte ORDER BY descricao');
        res.status(200).send(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os portes',
            error: error.message
        });
        console.error('Erro ao ler portes:', error);
    } finally {
        if (client) client.release();
    }
}

async function inserirPorte(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { descricao } = req.body;

        // Validação
        if (!descricao || descricao.trim() === '') {
            return res.status(400).json({
                message: 'Descrição do porte é obrigatória'
            });
        }

        // Query com RETURNING para obter o registro inserido
        const result = await client.query(
            'INSERT INTO Porte (descricao) VALUES ($1) RETURNING *',
            [descricao.trim()]
        );

        res.status(201).json({
            message: 'Porte criado com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para duplicados - PostgreSQL usa código 23505
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe um porte com esta descrição'
            });
        }

        res.status(500).json({
            message: 'Erro ao criar porte',
            error: error.message
        });
        console.error('Erro ao criar porte:', error);
    } finally {
        if (client) client.release();
    }
}

async function updatePorte(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idPorte } = req.params;
        const { descricao } = req.body;

        // Validação
        if (!descricao || descricao.trim() === '') {
            return res.status(400).json({
                message: 'Descrição do porte é obrigatória'
            });
        }

        // Query com RETURNING para obter o registro atualizado
        const result = await client.query(
            'UPDATE Porte SET descricao = $1 WHERE idPorte = $2 RETURNING *',
            [descricao.trim(), idPorte]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Porte não encontrado'
            });
        }

        res.status(200).json({
            message: 'Porte atualizado com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para duplicados - PostgreSQL usa código 23505
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe um porte com esta descrição'
            });
        }

        res.status(500).json({
            message: 'Erro ao atualizar porte',
            error: error.message
        });
        console.error('Erro ao atualizar porte:', error);
    } finally {
        if (client) client.release();
    }
}

async function deletePorte(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idPorte } = req.params;

        // Query com RETURNING para verificar o que foi deletado
        const result = await client.query(
            'DELETE FROM Porte WHERE idPorte = $1 RETURNING *',
            [idPorte]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Porte não encontrado'
            });
        }

        res.status(200).json({
            message: 'Porte removido com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para chave estrangeira - PostgreSQL usa código 23503
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível remover o porte pois está sendo utilizado'
            });
        }

        res.status(500).json({
            message: 'Erro ao remover porte',
            error: error.message
        });
        console.error('Erro ao remover porte:', error);
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    lerPorte,
    inserirPorte,
    updatePorte,
    deletePorte
};