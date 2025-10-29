const pool = require('../../connections/SQLConnections.js');

async function adicionarPetContrato(req, res) {
    let client;

    try {
        client = await pool.connect();

        const { idContrato, idPet } = req.body;

        // Validações
        if (!idContrato || !idPet) {
            return res.status(400).json({
                message: 'idContrato e idPet são obrigatórios'
            });
        }

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT idContrato FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Verificar se o pet existe
        const petResult = await client.query(
            'SELECT idPet FROM Pet WHERE idPet = $1', 
            [idPet]
        );
        if (petResult.rows.length === 0) {
            return res.status(404).json({ message: 'Pet não encontrado' });
        }

        // Verificar se o pet já está no contrato
        const existeResult = await client.query(
            'SELECT idcontrato_pet FROM contrato_pet WHERE idcontrato = $1 AND idpet = $2',
            [idContrato, idPet]
        );
        if (existeResult.rows.length > 0) {
            return res.status(400).json({ message: 'Pet já está adicionado a este contrato' });
        }

        // Inserir relação
        const result = await client.query(
            `INSERT INTO contrato_pet (idcontrato, idpet) 
             VALUES ($1, $2) 
             RETURNING *`,
            [idContrato, idPet]
        );

        res.status(201).json({
            message: 'Pet adicionado ao contrato com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao adicionar pet ao contrato',
            error: error.message
        });
        console.error('Erro ao adicionar pet ao contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function removerPetContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContratoPet } = req.params;

        // Verificar se a relação existe
        const relacaoResult = await client.query(
            'SELECT * FROM contrato_pet WHERE idcontrato_pet = $1', 
            [idContratoPet]
        );
        if (relacaoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Relação contrato-pet não encontrada' });
        }

        await client.query('DELETE FROM contrato_pet WHERE idcontrato_pet = $1', [idContratoPet]);

        res.status(200).json({
            message: 'Pet removido do contrato com sucesso',
            data: relacaoResult.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao remover pet do contrato',
            error: error.message
        });
        console.error('Erro ao remover pet do contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function listarPetsContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT idContrato FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const query = `
            SELECT 
                cp.idcontrato_pet,
                cp.idcontrato,
                cp.idpet,
                cp.datacriacao,
                p.nome as pet_nome,
                p.sexo,
                p.nascimento
            FROM contrato_pet cp
            JOIN pet p ON cp.idpet = p.idpet
            WHERE cp.idcontrato = $1
            ORDER BY p.nome
        `;

        const result = await client.query(query, [idContrato]);

        res.status(200).json(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar pets do contrato',
            error: error.message
        });
        console.error('Erro ao listar pets do contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    adicionarPetContrato,
    removerPetContrato,
    listarPetsContrato
};