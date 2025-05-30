const sqlconnection = require('../connections/SQLConnections.js');

async function lerContratosServico(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM ContratoServico');
        res.status(200).json(result);
    } catch (error) {
        console.error('Erro ao ler contratos serviços:', error);
        res.status(500).json({ 
            message: 'Erro ao buscar contratos serviços',
            error: error.message 
        });
    } finally {
        if (sql) await sql.end();
    }
}

async function buscarContratoServicoPorId(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idContratoServico } = req.params;
        const [result] = await sql.query('SELECT * FROM ContratoServico WHERE idContratoServico = ?', [idContratoServico]);
        
        if (result.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }
        
        res.status(200).json(result[0]);
    } catch (error) {
        console.error('Erro ao buscar contrato serviço:', error);
        res.status(500).json({ 
            message: 'Erro ao buscar contrato serviço',
            error: error.message 
        });
    } finally {
        if (sql) await sql.end();
    }
}

async function inserirContratoServico(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idContrato, idServico } = req.body;

        // Validação dos dados
        if (!idContrato || !idServico) {
            return res.status(400).json({ message: 'idContrato e idServico são obrigatórios' });
        }

        // Verifica se os IDs existem nas tabelas relacionadas
        const [contratoExists] = await sql.query('SELECT 1 FROM Contrato WHERE idContrato = ?', [idContrato]);
        const [servicoExists] = await sql.query('SELECT 1 FROM Servico WHERE idServico = ?', [idServico]);

        if (contratoExists.length === 0 || servicoExists.length === 0) {
            return res.status(400).json({ message: 'Contrato ou Serviço não encontrado' });
        }

        const [result] = await sql.query(
            'INSERT INTO ContratoServico (idContrato, idServico) VALUES (?, ?)',
            [idContrato, idServico]
        );

        res.status(201).json({
            message: 'Contrato serviço criado com sucesso!',
            idContratoServico: result.insertId,
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
        if (sql) await sql.end();
    }
}

async function atualizarContratoServico(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idContratoServico } = req.params;
        const { idContrato, idServico } = req.body;

        // Validação dos dados
        if (!idContrato || !idServico) {
            return res.status(400).json({ message: 'idContrato e idServico são obrigatórios' });
        }

        // Verifica se o registro existe
        const [existing] = await sql.query('SELECT 1 FROM ContratoServico WHERE idContratoServico = ?', [idContratoServico]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        // Verifica se os novos IDs existem
        const [contratoExists] = await sql.query('SELECT 1 FROM Contrato WHERE idContrato = ?', [idContrato]);
        const [servicoExists] = await sql.query('SELECT 1 FROM Servico WHERE idServico = ?', [idServico]);

        if (contratoExists.length === 0 || servicoExists.length === 0) {
            return res.status(400).json({ message: 'Contrato ou Serviço não encontrado' });
        }

        await sql.query(
            'UPDATE ContratoServico SET idContrato = ?, idServico = ? WHERE idContratoServico = ?',
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
        if (sql) await sql.end();
    }
}

async function excluirContratoServico(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idContratoServico } = req.params;

        // Verifica se o registro existe
        const [existing] = await sql.query('SELECT 1 FROM ContratoServico WHERE idContratoServico = ?', [idContratoServico]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        await sql.query('DELETE FROM ContratoServico WHERE idContratoServico = ?', [idContratoServico]);

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
        if (sql) await sql.end();
    }
}

module.exports = {
    lerContratosServico,
    buscarContratoServicoPorId,
    inserirContratoServico,
    atualizarContratoServico,
    excluirContratoServico
};