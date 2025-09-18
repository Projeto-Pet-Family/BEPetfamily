const pgconnection = require('../../connections/SQLConnections.js');

async function lerStatus(req, res) {
    let client;
    try {
        client = await pgconnection();
        const result = await client.query('SELECT * FROM Status');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar status',
            error: error.message
        });
        console.error('Erro ao listar status:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarStatusPorId(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idStatus } = req.params;
        
        const result = await client.query('SELECT * FROM Status WHERE idStatus = $1', [idStatus]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Status não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar status',
            error: error.message
        });
        console.error('Erro ao buscar status:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarStatus(req, res) {
    let client;
    try {
        client = await pgconnection();

        // Cria status com emAprovacao=true e os demais false
        const result = await client.query(`
            INSERT INTO Status 
            (emAprovacao, aprovado, negado, cancelado, emExecucao, concluido) 
            VALUES (true, false, false, false, false, false)
            RETURNING *
        `);

        res.status(201).json({
            message: 'Status criado com sucesso (emAprovacao=true)',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar status',
            error: error.message
        });
        console.error('Erro ao criar status:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarStatus(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idStatus } = req.params;
        const { 
            emAprovacao, 
            aprovado, 
            negado, 
            cancelado, 
            emExecucao, 
            concluido 
        } = req.body;

        // Verificar se o status existe
        const statusResult = await client.query('SELECT * FROM Status WHERE idStatus = $1', [idStatus]);
        if (statusResult.rows.length === 0) {
            return res.status(404).json({ message: 'Status não encontrado' });
        }

        // Construir a query dinamicamente
        const updateFields = {};
        const values = [];
        let paramCount = 1;

        if (emAprovacao !== undefined) {
            updateFields.emAprovacao = `$${paramCount}`;
            values.push(emAprovacao);
            paramCount++;
        }
        if (aprovado !== undefined) {
            updateFields.aprovado = `$${paramCount}`;
            values.push(aprovado);
            paramCount++;
        }
        if (negado !== undefined) {
            updateFields.negado = `$${paramCount}`;
            values.push(negado);
            paramCount++;
        }
        if (cancelado !== undefined) {
            updateFields.cancelado = `$${paramCount}`;
            values.push(cancelado);
            paramCount++;
        }
        if (emExecucao !== undefined) {
            updateFields.emExecucao = `$${paramCount}`;
            values.push(emExecucao);
            paramCount++;
        }
        if (concluido !== undefined) {
            updateFields.concluido = `$${paramCount}`;
            values.push(concluido);
            paramCount++;
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ 
                message: 'Nenhum campo válido para atualização fornecido' 
            });
        }

        // Construir a cláusula SET
        const setClauses = Object.entries(updateFields)
            .map(([key, value]) => `${key} = ${value}`)
            .join(', ');

        values.push(idStatus);

        // Atualizar o status e retornar os dados atualizados
        const updateResult = await client.query(`
            UPDATE Status 
            SET ${setClauses} 
            WHERE idStatus = $${paramCount} 
            RETURNING *
        `, values);

        res.status(200).json({
            message: 'Status atualizado com sucesso',
            data: updateResult.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar status',
            error: error.message
        });
        console.error('Erro ao atualizar status:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function excluirStatus(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idStatus } = req.params;

        // Verificar se o status existe
        const statusResult = await client.query('SELECT * FROM Status WHERE idStatus = $1', [idStatus]);
        if (statusResult.rows.length === 0) {
            return res.status(404).json({ message: 'Status não encontrado' });
        }

        await client.query('DELETE FROM Status WHERE idStatus = $1', [idStatus]);

        res.status(200).json({
            message: 'Status excluído com sucesso',
            data: statusResult.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir status',
            error: error.message
        });
        console.error('Erro ao excluir status:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerStatus,
    buscarStatusPorId,
    criarStatus,
    atualizarStatus,
    excluirStatus
};