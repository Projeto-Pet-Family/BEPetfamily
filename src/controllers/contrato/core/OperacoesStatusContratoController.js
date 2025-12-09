const pool = require('../../../connections/SQLConnections.js');
/* const { buscarContratoComRelacionamentos, validarStatus, statusMap } = require('../ContratoController'); */
const { 
    buscarContratoComRelacionamentos, 
    validarStatus, 
    validarDatas, 
    construirQueryUpdate, 
    statusNaoEditaveis, 
    statusMap 
} = require('../ContratoUtils.js');

const atualizarStatusContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { status } = req.body;

        if (!validarStatus(status)) {
            return res.status(400).json({ message: 'Status inválido' });
        }

        const contratoExistente = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        await client.query(
            'UPDATE contrato SET status = $1, dataatualizacao = CURRENT_TIMESTAMP WHERE idcontrato = $2',
            [status, idContrato]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        res.status(200).json({ 
            message: 'Status do contrato atualizado com sucesso', 
            data: contratoCompleto 
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar status do contrato', error: error.message });
    } finally {
        if (client) await client.release();
    }
};

const alterarStatusContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const { idContrato } = req.params;
        const { status, motivo } = req.body;

        if (!status) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status é obrigatório' });
        }

        if (!validarStatus(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status inválido' });
        }

        const contratoResult = await client.query(
            'SELECT * FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contratoAtual = contratoResult.rows[0];
        const statusAtual = contratoAtual.status;

        const transicoesPermitidas = {
            'em_aprovacao': ['aprovado', 'negado', 'cancelado'],
            'aprovado': ['em_execucao', 'cancelado'],
            'em_execucao': ['concluido', 'cancelado'],
            'concluido': [],
            'negado': [],
            'cancelado': []
        };

        const transicoes = transicoesPermitidas[statusAtual];
        if (!transicoes || !transicoes.includes(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: `Não é possível alterar o status de "${statusMap[statusAtual]}" para "${statusMap[status]}"`,
                statusAtual: statusAtual,
                statusNovo: status,
                transicoesPermitidas: transicoesPermitidas[statusAtual]
            });
        }

        switch (status) {
            case 'em_execucao':
                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                const dataInicio = new Date(contratoAtual.datainicio); dataInicio.setHours(0, 0, 0, 0);
                
                if (dataInicio > hoje) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ 
                        message: 'Não é possível iniciar a execução antes da data de início do contrato'
                    });
                }
                break;

            case 'concluido':
                if (contratoAtual.datafim) {
                    const dataFim = new Date(contratoAtual.datafim); dataFim.setHours(0, 0, 0, 0);
                    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                    
                    if (dataFim > hoje) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ 
                            message: 'Não é possível concluir o contrato antes da data de fim'
                        });
                    }
                }
                break;

            case 'negado':
                if (!motivo || motivo.trim().length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ 
                        message: 'Motivo é obrigatório para negar um contrato'
                    });
                }
                break;
        }

        const updateQuery = `
            UPDATE contrato 
            SET status = $1, dataatualizacao = CURRENT_TIMESTAMP 
            WHERE idcontrato = $2 
            RETURNING *
        `;

        await client.query(updateQuery, [status, idContrato]);
        
        if (status === 'negado' && motivo) {
            console.log(`Contrato ${idContrato} negado. Motivo: ${motivo}`);
        }

        await client.query('COMMIT');

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: `Status do contrato alterado de "${statusMap[statusAtual]}" para "${statusMap[status]}" com sucesso`,
            data: contratoCompleto,
            alteracao: {
                de: statusAtual,
                para: status,
                descricao: `De ${statusMap[statusAtual]} para ${statusMap[status]}`
            }
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Erro ao alterar status do contrato:', error);
        res.status(500).json({ 
            message: 'Erro ao alterar status do contrato', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

const obterTransicoesStatus = async (req, res) => {
    let client;
    try {
        const { idContrato } = req.params;

        client = await pool.connect();
        
        const contratoResult = await client.query(
            'SELECT status FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const statusAtual = contratoResult.rows[0].status;

        const transicoesPermitidas = {
            'em_aprovacao': ['aprovado', 'negado', 'cancelado'],
            'aprovado': ['em_execucao', 'cancelado'],
            'em_execucao': ['concluido', 'cancelado'],
            'concluido': [],
            'negado': [],
            'cancelado': []
        };

        const transicoes = transicoesPermitidas[statusAtual] || [];

        res.status(200).json({
            statusAtual: statusAtual,
            descricaoStatusAtual: statusMap[statusAtual],
            transicoesPermitidas: transicoes.map(status => ({
                status: status,
                descricao: statusMap[status]
            })),
            todasOpcoes: statusValidos.map(status => ({
                status: status,
                descricao: statusMap[status],
                permitido: transicoes.includes(status)
            }))
        });

    } catch (error) {
        console.error('Erro ao obter transições de status:', error);
        res.status(500).json({ 
            message: 'Erro ao obter transições de status', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

const filtrarContratosUsuarioPorStatus = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        const { status, dataInicio, dataFim, orderBy = 'datacriacao', orderDirection = 'DESC' } = req.query;

        // Validação dos status
        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            const statusInvalidos = statusArray.filter(s => !validarStatus(s));
            
            if (statusInvalidos.length > 0) {
                return res.status(400).json({ 
                    message: `Status inválido(s): ${statusInvalidos.join(', ')}` 
                });
            }
        }

        // Construir query base
        let query = `
            SELECT 
                c.*,
                h.nome as nome_hospedagem,
                u.nome as nome_usuario,
                u.email as email_usuario
            FROM contrato c
            INNER JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            INNER JOIN usuario u ON c.idusuario = u.idusuario
            WHERE c.idusuario = $1
        `;

        const queryParams = [idUsuario];
        let paramCount = 1;

        // Adicionar filtros
        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            paramCount++;
            query += ` AND c.status IN (${statusArray.map((_, idx) => `$${paramCount + idx}`).join(', ')})`;
            queryParams.push(...statusArray);
            paramCount += statusArray.length - 1;
        }

        if (dataInicio) {
            paramCount++;
            query += ` AND c.datacriacao >= $${paramCount}`;
            queryParams.push(dataInicio);
        }

        if (dataFim) {
            paramCount++;
            query += ` AND c.datacriacao <= $${paramCount}`;
            queryParams.push(dataFim);
        }

        // Validar e adicionar ordenação
        const camposOrdenaveis = ['datacriacao', 'dataatualizacao', 'datainicio', 'datafim', 'valor', 'status'];
        const direcoesValidas = ['ASC', 'DESC'];
        
        const campoOrdenacao = camposOrdenaveis.includes(orderBy) ? orderBy : 'datacriacao';
        const direcao = direcoesValidas.includes(orderDirection.toUpperCase()) ? orderDirection.toUpperCase() : 'DESC';
        
        query += ` ORDER BY c.${campoOrdenacao} ${direcao}`;

        // Executar query
        const result = await client.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(200).json({ 
                message: 'Nenhum contrato encontrado para os filtros aplicados',
                data: [],
                filtros: {
                    usuario: idUsuario,
                    status: status || 'todos',
                    dataInicio,
                    dataFim
                }
            });
        }

        // Agrupar por status para estatísticas
        const estatisticas = {
            total: result.rows.length,
            porStatus: {},
            valores: {
                total: 0,
                medio: 0
            }
        };

        // Calcular estatísticas
        result.rows.forEach(contrato => {
            const statusContrato = contrato.status;
            
            if (!estatisticas.porStatus[statusContrato]) {
                estatisticas.porStatus[statusContrato] = {
                    quantidade: 0,
                    valorTotal: 0,
                    descricao: statusMap[statusContrato] || 'Desconhecido'
                };
            }
            
            estatisticas.porStatus[statusContrato].quantidade++;
            estatisticas.porStatus[statusContrato].valorTotal += parseFloat(contrato.valor || 0);
            estatisticas.valores.total += parseFloat(contrato.valor || 0);
        });

        // Calcular valor médio
        estatisticas.valores.medio = estatisticas.total > 0 ? 
            estatisticas.valores.total / estatisticas.total : 0;

        // Formatar dados dos contratos
        const contratosFormatados = result.rows.map(contrato => ({
            id: contrato.idcontrato,
            hospedagem: {
                id: contrato.idhospedagem,
                nome: contrato.nome_hospedagem
            },
            usuario: {
                id: contrato.idusuario,
                nome: contrato.nome_usuario,
                email: contrato.email_usuario
            },
            status: {
                codigo: contrato.status,
                descricao: statusMap[contrato.status] || 'Desconhecido'
            },
            datas: {
                criacao: contrato.datacriacao,
                atualizacao: contrato.dataatualizacao,
                inicio: contrato.datainicio,
                fim: contrato.datafim
            },
            valor: contrato.valor,
            observacoes: contrato.observacoes
        }));

        res.status(200).json({
            message: 'Contratos filtrados com sucesso',
            data: contratosFormatados,
            estatisticas: estatisticas,
            filtros: {
                usuario: idUsuario,
                status: status || 'todos',
                dataInicio,
                dataFim,
                orderBy: campoOrdenacao,
                orderDirection: direcao
            },
            paginacao: {
                total: result.rows.length,
                pagina: 1,
                porPagina: contratosFormatados.length
            }
        });

    } catch (error) {
        console.error('Erro ao filtrar contratos:', error);
        res.status(500).json({ 
            message: 'Erro ao filtrar contratos', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

module.exports = {
    atualizarStatusContrato,
    alterarStatusContrato,
    obterTransicoesStatus,
    filtrarContratosUsuarioPorStatus
};