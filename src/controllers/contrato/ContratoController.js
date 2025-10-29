const pool = require('../../connections/SQLConnections.js');

async function lerContratos(req, res) {
    let client;

    try {
        client = await pool.connect();
        const query = `
            SELECT 
                c.*, 
                h.nome as hospedagem_nome, 
                u.nome as usuario_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
        `;
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar contratos',
            error: error.message
        });
        console.error('Erro ao listar contratos:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarContratoPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const query = `
            SELECT 
                c.*, 
                h.nome as hospedagem_nome, 
                u.nome as usuario_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
            WHERE c.idContrato = $1
        `;

        const result = await client.query(query, [idContrato]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contrato',
            error: error.message
        });
        console.error('Erro ao buscar contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarContrato(req, res) {
    let client;

    try {
        client = await pool.connect();

        const {
            idHospedagem,
            idUsuario,
            status = 'em_aprovacao', // Default: "em_aprovacao"
            dataInicio,
            dataFim
        } = req.body;

        // Validações básicas
        if (!idHospedagem || !idUsuario || !dataInicio) {
            return res.status(400).json({
                message: 'idHospedagem, idUsuario e dataInicio são obrigatórios'
            });
        }

        // Validar status
        const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({
                message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
            });
        }

        // Validar datas
        const inicio = new Date(dataInicio);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (inicio < hoje) {
            return res.status(400).json({
                message: 'Data início não pode ser anterior à data atual'
            });
        }

        if (dataFim) {
            const fim = new Date(dataFim);
            if (fim < inicio) {
                return res.status(400).json({
                    message: 'Data fim não pode ser anterior à data início'
                });
            }
        }

        // Verificar existência das entidades relacionadas
        const hospedagemResult = await client.query(
            'SELECT idHospedagem FROM Hospedagem WHERE idHospedagem = $1', 
            [idHospedagem]
        );
        if (hospedagemResult.rows.length === 0) {
            return res.status(400).json({ message: 'Hospedagem não encontrada' });
        }

        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(400).json({ message: 'Usuário não encontrado' });
        }

        // Verificar se já existe contrato conflitante para as datas
        const conflitoQuery = `
            SELECT idContrato 
            FROM Contrato 
            WHERE idUsuario = $1 
            AND status IN ('em_aprovacao', 'aprovado', 'em_execucao')
            AND (
                (dataInicio <= $2 AND dataFim >= $3) OR
                (dataInicio <= $2 AND $3 IS NULL) OR
                ($2 BETWEEN dataInicio AND COALESCE(dataFim, $2))
            )
        `;
        
        const conflitoResult = await client.query(conflitoQuery, [
            idUsuario, 
            dataInicio, 
            dataFim || dataInicio
        ]);

        if (conflitoResult.rows.length > 0) {
            return res.status(400).json({
                message: 'Já existe um contrato ativo para este período'
            });
        }

        // Inserir contrato
        const result = await client.query(
            `INSERT INTO Contrato (idHospedagem, idUsuario, status, dataInicio, dataFim) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [idHospedagem, idUsuario, status, dataInicio, dataFim]
        );

        res.status(201).json({
            message: 'Contrato criado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar contrato',
            error: error.message
        });
        console.error('Erro ao criar contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const {
            idHospedagem,
            idUsuario,
            status,
            dataInicio,
            dataFim
        } = req.body;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Validar status se fornecido
        if (status) {
            const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
            if (!statusValidos.includes(status)) {
                return res.status(400).json({
                    message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
                });
            }
        }

        // Validar datas se fornecidas
        if (dataInicio && dataFim) {
            const inicio = new Date(dataInicio);
            const fim = new Date(dataFim);

            if (fim < inicio) {
                return res.status(400).json({
                    message: 'Data fim não pode ser anterior à data início'
                });
            }
        }

        // Verificar entidades relacionadas se fornecidas
        if (idHospedagem) {
            const hospedagemResult = await client.query(
                'SELECT idHospedagem FROM Hospedagem WHERE idHospedagem = $1', 
                [idHospedagem]
            );
            if (hospedagemResult.rows.length === 0) {
                return res.status(400).json({ message: 'Hospedagem não encontrada' });
            }
        }

        if (idUsuario) {
            const usuarioResult = await client.query(
                'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
                [idUsuario]
            );
            if (usuarioResult.rows.length === 0) {
                return res.status(400).json({ message: 'Usuário não encontrado' });
            }
        }

        // Construir query dinâmica
        const updateFields = {};
        const values = [];
        let paramCount = 1;

        if (idHospedagem !== undefined) {
            updateFields.idHospedagem = `$${paramCount}`;
            values.push(idHospedagem);
            paramCount++;
        }
        if (idUsuario !== undefined) {
            updateFields.idUsuario = `$${paramCount}`;
            values.push(idUsuario);
            paramCount++;
        }
        if (status !== undefined) {
            updateFields.status = `$${paramCount}`;
            values.push(status);
            paramCount++;
        }
        if (dataInicio) {
            updateFields.dataInicio = `$${paramCount}`;
            values.push(dataInicio);
            paramCount++;
        }
        if (dataFim !== undefined) {
            updateFields.dataFim = `$${paramCount}`;
            values.push(dataFim);
            paramCount++;
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        const setClauses = Object.entries(updateFields)
            .map(([key, value]) => `${key} = ${value}`)
            .join(', ');

        values.push(idContrato);

        const query = `
            UPDATE Contrato 
            SET ${setClauses} 
            WHERE idContrato = $${paramCount} 
            RETURNING *
        `;

        const result = await client.query(query, values);

        res.status(200).json({
            message: 'Contrato atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar contrato',
            error: error.message
        });
        console.error('Erro ao atualizar contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarStatusContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { status } = req.body;

        // Validar status
        const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({
                message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
            });
        }

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Atualizar apenas o status
        const result = await client.query(
            `UPDATE Contrato 
             SET status = $1, dataAtualizacao = CURRENT_TIMESTAMP
             WHERE idContrato = $2 
             RETURNING *`,
            [status, idContrato]
        );

        res.status(200).json({
            message: 'Status do contrato atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar status do contrato',
            error: error.message
        });
        console.error('Erro ao atualizar status do contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function excluirContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        await client.query('DELETE FROM Contrato WHERE idContrato = $1', [idContrato]);

        res.status(200).json({
            message: 'Contrato excluído com sucesso',
            data: contratoResult.rows[0]
        });

    } catch (error) {
        // PostgreSQL error code for foreign key violation
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível excluir o contrato pois está sendo utilizado em outros registros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir contrato',
            error: error.message
        });
        console.error('Erro ao excluir contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarContratosPorUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;

        // Verificar se o usuário existe
        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const query = `
            SELECT 
                c.idContrato,
                c.idHospedagem,
                c.idUsuario,
                c.status,
                c.dataInicio,
                c.dataFim,
                c.dataCriacao,
                c.dataAtualizacao,
                h.nome as hospedagem_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            WHERE c.idUsuario = $1
            ORDER BY c.dataInicio DESC, c.dataCriacao DESC
        `;

        const result = await client.query(query, [idUsuario]);

        // Formatar o status para português
        const contratosFormatados = result.rows.map(contrato => {
            const statusMap = {
                'em_aprovacao': 'Em aprovação',
                'aprovado': 'Aprovado',
                'em_execucao': 'Em execução',
                'concluido': 'Concluído',
                'negado': 'Negado',
                'cancelado': 'Cancelado'
            };

            return {
                ...contrato,
                status_descricao: statusMap[contrato.status] || 'Desconhecido'
            };
        });

        res.status(200).json(contratosFormatados);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarContratosPorUsuarioEStatus(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario, status } = req.query;

        if (!idUsuario) {
            return res.status(400).json({ message: 'idUsuario é obrigatório' });
        }

        // Verificar se o usuário existe
        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        let query = `
            SELECT 
                c.idContrato,
                c.idHospedagem,
                c.idUsuario,
                c.status,
                c.dataInicio,
                c.dataFim,
                c.dataCriacao,
                c.dataAtualizacao,
                h.nome as hospedagem_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            WHERE c.idUsuario = $1
        `;

        const values = [idUsuario];
        let paramCount = 2;

        if (status) {
            // Validar status
            const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
            if (!statusValidos.includes(status)) {
                return res.status(400).json({
                    message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
                });
            }
            
            query += ` AND c.status = $${paramCount}`;
            values.push(status);
            paramCount++;
        }

        query += ` ORDER BY c.dataInicio DESC, c.dataCriacao DESC`;

        const result = await client.query(query, values);

        // Formatar o status para português
        const contratosFormatados = result.rows.map(contrato => {
            const statusMap = {
                'em_aprovacao': 'Em aprovação',
                'aprovado': 'Aprovado',
                'em_execucao': 'Em execução',
                'concluido': 'Concluído',
                'negado': 'Negado',
                'cancelado': 'Cancelado'
            };

            return {
                ...contrato,
                status_descricao: statusMap[contrato.status] || 'Desconhecido'
            };
        });

        res.status(200).json(contratosFormatados);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    atualizarStatusContrato,
    excluirContrato,
    buscarContratosPorUsuario,
    buscarContratosPorUsuarioEStatus
};