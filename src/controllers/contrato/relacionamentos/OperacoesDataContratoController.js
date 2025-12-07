const pool = require('../../../connections/SQLConnections.js');
const { 
    buscarContratoComRelacionamentos, 
    validarStatus, 
    validarDatas, 
    construirQueryUpdate, 
    statusNaoEditaveis, 
    statusMap 
} = require('../ContratoUtils.js');

const atualizarDatasContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { dataInicio, dataFim } = req.body;

        if (!dataInicio && !dataFim) {
            return res.status(400).json({ 
                success: false,
                message: 'Nenhuma data fornecida para atualização' 
            });
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (dataInicio) {
            updates.push(`datainicio = $${paramIndex}`);
            values.push(dataInicio);
            paramIndex++;
        }
        
        if (dataFim) {
            updates.push(`datafim = $${paramIndex}`);
            values.push(dataFim);
            paramIndex++;
        }
        
        updates.push(`dataatualizacao = CURRENT_TIMESTAMP`);
        
        values.push(idContrato);
        
        const query = `
            UPDATE contrato 
            SET ${updates.join(', ')}
            WHERE idcontrato = $${paramIndex}
            RETURNING *
        `;

        const result = await client.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Contrato não encontrado' 
            });
        }

        res.status(200).json({
            success: true,
            message: 'Datas atualizadas com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Erro:', error);
        
        if (error.message && error.message.includes('integer')) {
            return res.status(400).json({ 
                success: false,
                message: 'Formato de data inválido. Envie no formato "YYYY-MM-DD" (exemplo: "2025-12-10")',
                error: error.message
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'Erro interno do servidor',
            error: error.message 
        });
    } finally { 
        if (client) client.release(); 
    }
};

module.exports = {
    atualizarDatasContrato
};