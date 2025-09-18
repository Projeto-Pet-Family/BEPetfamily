const pool = require('../../connections/SQLConnections.js');

async function lerEspecie(req, res) {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM Especie ORDER BY descricao');
        res.status(200).send(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler as espécies',
            error: error.message
        });
        console.error('Erro ao ler espécies:', error);
    } finally {
        if (client) client.release();
    }
}

async function lerEspeciePorId(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idEspecie } = req.params;

        const result = await client.query(
            'SELECT * FROM Especie WHERE idEspecie = $1',
            [idEspecie]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Espécie não encontrada'
            });
        }

        res.status(200).send(result.rows[0]);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler a espécie',
            error: error.message
        });
        console.error('Erro ao ler espécie:', error);
    } finally {
        if (client) client.release();
    }
}

async function inserirEspecie(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { descricao } = req.body;

        // Validação
        if (!descricao || descricao.trim() === '') {
            return res.status(400).json({
                message: 'Descrição da espécie é obrigatória'
            });
        }

        // Query com RETURNING para obter o registro inserido
        const result = await client.query(
            'INSERT INTO Especie (descricao) VALUES ($1) RETURNING *',
            [descricao.trim()]
        );

        res.status(201).json({
            message: 'Espécie criada com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para duplicados - PostgreSQL usa código 23505
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe uma espécie com esta descrição'
            });
        }

        res.status(500).json({
            message: 'Erro ao criar espécie',
            error: error.message
        });
        console.error('Erro ao criar espécie:', error);
    } finally {
        if (client) client.release();
    }
}

async function updateEspecie(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idEspecie } = req.params;
        const { descricao } = req.body;

        // Validação
        if (!descricao || descricao.trim() === '') {
            return res.status(400).json({
                message: 'Descrição da espécie é obrigatória'
            });
        }

        // Query com RETURNING para obter o registro atualizado
        const result = await client.query(
            'UPDATE Especie SET descricao = $1 WHERE idEspecie = $2 RETURNING *',
            [descricao.trim(), idEspecie]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Espécie não encontrada'
            });
        }

        res.status(200).json({
            message: 'Espécie atualizada com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para duplicados - PostgreSQL usa código 23505
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe uma espécie com esta descrição'
            });
        }

        res.status(500).json({
            message: 'Erro ao atualizar espécie',
            error: error.message
        });
        console.error('Erro ao atualizar espécie:', error);
    } finally {
        if (client) client.release();
    }
}

async function deleteEspecie(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idEspecie } = req.params;

        // Query com RETURNING para verificar o que foi deletado
        const result = await client.query(
            'DELETE FROM Especie WHERE idEspecie = $1 RETURNING *',
            [idEspecie]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Espécie não encontrada'
            });
        }

        res.status(200).json({
            message: 'Espécie removida com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        // Tratamento para chave estrangeira - PostgreSQL usa código 23503
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível remover a espécie pois está sendo utilizada em raças'
            });
        }

        res.status(500).json({
            message: 'Erro ao remover espécie',
            error: error.message
        });
        console.error('Erro ao remover espécie:', error);
    } finally {
        if (client) client.release();
    }
}

module.exports = {
    lerEspecie,
    lerEspeciePorId,
    inserirEspecie,
    updateEspecie,
    deleteEspecie
};