const pgconnection = require('../../connections/SQLConnections.js');

async function lerContratosServico(req, res) {
    let client;
    try {
        client = await pgconnection();
        const result = await client.query('SELECT * FROM "ContratoServico"');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Erro ao ler contratos serviços:', error);
        res.status(500).json({
            message: 'Erro ao buscar contratos serviços',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function buscarContratoServicoPorId(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idContratoServico } = req.params;
        const result = await client.query(
            'SELECT * FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao buscar contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function inserirContratoServico(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idContrato, idServico } = req.body;

        // Validação dos dados
        if (!idContrato || !idServico) {
            return res.status(400).json({ message: 'idContrato e idServico são obrigatórios' });
        }

        // Verifica se os IDs existem nas tabelas relacionadas
        const contratoExists = await client.query(
            'SELECT 1 FROM "Contrato" WHERE "idContrato" = $1', 
            [idContrato]
        );
        const servicoExists = await client.query(
            'SELECT 1 FROM "Servico" WHERE "idServico" = $1', 
            [idServico]
        );

        if (contratoExists.rows.length === 0 || servicoExists.rows.length === 0) {
            return res.status(400).json({ message: 'Contrato ou Serviço não encontrado' });
        }

        const result = await client.query(
            'INSERT INTO "ContratoServico" ("idContrato", "idServico") VALUES ($1, $2) RETURNING "idContratoServico"',
            [idContrato, idServico]
        );

        res.status(201).json({
            message: 'Contrato serviço criado com sucesso!',
            idContratoServico: result.rows[0].idContratoServico,
            idContrato,
            idServico
        });
    } catch (error) {
        console.error('Erro ao inserir contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao criar contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function atualizarContratoServico(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idContratoServico } = req.params;
        const { idContrato, idServico } = req.body;

        // Validação dos dados
        if (!idContrato || !idServico) {
            return res.status(400).json({ message: 'idContrato e idServico são obrigatórios' });
        }

        // Verifica se o registro existe
        const existing = await client.query(
            'SELECT 1 FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        // Verifica se os novos IDs existem
        const contratoExists = await client.query(
            'SELECT 1 FROM "Contrato" WHERE "idContrato" = $1', 
            [idContrato]
        );
        const servicoExists = await client.query(
            'SELECT 1 FROM "Servico" WHERE "idServico" = $1', 
            [idServico]
        );

        if (contratoExists.rows.length === 0 || servicoExists.rows.length === 0) {
            return res.status(400).json({ message: 'Contrato ou Serviço não encontrado' });
        }

        await client.query(
            'UPDATE "ContratoServico" SET "idContrato" = $1, "idServico" = $2 WHERE "idContratoServico" = $3',
            [idContrato, idServico, idContratoServico]
        );

        res.status(200).json({
            message: 'Contrato serviço atualizado com sucesso!',
            idContratoServico,
            idContrato,
            idServico
        });
    } catch (error) {
        console.error('Erro ao atualizar contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao atualizar contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function excluirContratoServico(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idContratoServico } = req.params;

        // Verifica se o registro existe
        const existing = await client.query(
            'SELECT 1 FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        await client.query(
            'DELETE FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );

        res.status(200).json({
            message: 'Contrato serviço excluído com sucesso!',
            idContratoServico
        });
    } catch (error) {
        console.error('Erro ao excluir contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao excluir contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

module.exports = {
    lerContratosServico,
    buscarContratoServicoPorId,
    inserirContratoServico,
    atualizarContratoServico,
    excluirContratoServico
};