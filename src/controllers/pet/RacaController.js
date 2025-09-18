const pool = require('../../connections/SQLConnections.js');

async function lerRaca(req, res) {
    let client;
    try {
        client = await pool.connect();

        const result = await client.query(`
            SELECT r.*, e.descricao as descricaoEspecie 
            FROM Raca r
            JOIN Especie e ON r.idEspecie = e.idEspecie
        `);

        res.status(200).send(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler as raças, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function lerRacaPorEspecie(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idEspecie } = req.params;

        const result = await client.query(`
            SELECT r.*, e.descricao as descricaoEspecie 
            FROM Raca r
            JOIN Especie e ON r.idEspecie = e.idEspecie
            WHERE r.idEspecie = $1
        `, [idEspecie]);

        res.status(200).send(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler as raças por espécie, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function inserirRaca(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { descricao, idEspecie } = req.body;

        if (!descricao || !idEspecie) {
            return res.status(400).json({
                message: 'Descrição e ID da espécie são obrigatórios'
            });
        }

        // Verifica se a espécie existe
        const especieResult = await client.query(
            'SELECT 1 FROM Especie WHERE idEspecie = $1', 
            [idEspecie]
        );
        
        if (especieResult.rows.length === 0) {
            return res.status(400).json({
                message: 'Espécie não encontrada'
            });
        }

        // Query com RETURNING para obter o registro inserido
        const result = await client.query(
            'INSERT INTO Raca (descricao, idEspecie) VALUES ($1, $2) RETURNING *',
            [descricao, idEspecie]
        );

        res.status(201).json({
            message: 'Raça criada com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar a raça, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function updateRaca(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idRaca } = req.params;
        const { descricao, idEspecie } = req.body;

        // Validações
        if (!descricao || !idEspecie) {
            return res.status(400).json({
                message: 'Descrição e ID da espécie são obrigatórios'
            });
        }

        // Verifica se a espécie existe
        const especieResult = await client.query(
            'SELECT 1 FROM Especie WHERE idEspecie = $1', 
            [idEspecie]
        );
        
        if (especieResult.rows.length === 0) {
            return res.status(400).json({
                message: 'Espécie não encontrada'
            });
        }

        // Query com RETURNING para obter o registro atualizado
        const result = await client.query(
            'UPDATE Raca SET descricao = $1, idEspecie = $2 WHERE idRaca = $3 RETURNING *',
            [descricao, idEspecie, idRaca]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Raça não encontrada'
            });
        }

        res.status(200).json({
            message: 'Raça atualizada com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar a raça, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function deleteRaca(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idRaca } = req.params;

        // Query com RETURNING para verificar o que foi deletado
        const result = await client.query(
            'DELETE FROM Raca WHERE idRaca = $1 RETURNING *',
            [idRaca]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Raça não encontrada'
            });
        }

        res.status(200).json({
            message: 'Raça deletada com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        // Verifica se o erro é de restrição de chave estrangeira (PostgreSQL: 23503)
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível deletar a raça pois está sendo utilizada em outros registros'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao deletar a raça, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

module.exports = {
    lerRaca,
    lerRacaPorEspecie,
    inserirRaca,
    updateRaca,
    deleteRaca
};