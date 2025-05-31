const sqlconnection = require('../../connections/SQLConnections.js');

async function lerStatus(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Status');
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar status',
            error: error.message
        });
        console.error('Erro ao listar status:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarStatusPorId(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idStatus } = req.params;
        
        const [result] = await sql.query('SELECT * FROM Status WHERE idStatus = ?', [idStatus]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Status não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar status',
            error: error.message
        });
        console.error('Erro ao buscar status:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarStatus(req, res) {
    let sql;
    try {
        sql = await sqlconnection();

        // Cria status com emAprovacao=true e os demais false
        const [result] = await sql.query(`
            INSERT INTO Status 
            (emAprovacao, aprovado, negado, cancelado, emExecucao, concluido) 
            VALUES (true, false, false, false, false, false)
        `);

        // Busca o status criado
        const [novoStatus] = await sql.query('SELECT * FROM Status WHERE idStatus = ?', [result.insertId]);

        res.status(201).json({
            message: 'Status criado com sucesso (emAprovacao=true)',
            data: novoStatus[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar status',
            error: error.message
        });
        console.error('Erro ao criar status:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarStatus(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
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
        const [status] = await sql.query('SELECT * FROM Status WHERE idStatus = ?', [idStatus]);
        if (status.length === 0) {
            return res.status(404).json({ message: 'Status não encontrado' });
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (emAprovacao !== undefined) updateFields.emAprovacao = emAprovacao;
        if (aprovado !== undefined) updateFields.aprovado = aprovado;
        if (negado !== undefined) updateFields.negado = negado;
        if (cancelado !== undefined) updateFields.cancelado = cancelado;
        if (emExecucao !== undefined) updateFields.emExecucao = emExecucao;
        if (concluido !== undefined) updateFields.concluido = concluido;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ 
                message: 'Nenhum campo válido para atualização fornecido' 
            });
        }

        // Atualizar o status
        await sql.query('UPDATE Status SET ? WHERE idStatus = ?', [updateFields, idStatus]);

        // Buscar o status atualizado
        const [statusAtualizado] = await sql.query('SELECT * FROM Status WHERE idStatus = ?', [idStatus]);

        res.status(200).json({
            message: 'Status atualizado com sucesso',
            data: statusAtualizado[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar status',
            error: error.message
        });
        console.error('Erro ao atualizar status:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirStatus(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idStatus } = req.params;

        // Verificar se o status existe
        const [status] = await sql.query('SELECT * FROM Status WHERE idStatus = ?', [idStatus]);
        if (status.length === 0) {
            return res.status(404).json({ message: 'Status não encontrado' });
        }

        await sql.query('DELETE FROM Status WHERE idStatus = ?', [idStatus]);

        res.status(200).json({
            message: 'Status excluído com sucesso',
            data: status[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir status',
            error: error.message
        });
        console.error('Erro ao excluir status:', error);
    } finally {
        if (sql) {
            await sql.end();
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