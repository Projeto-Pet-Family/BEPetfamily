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

        // Construir query base (MESMA QUERY DO lerContratos)
        let query = `
            SELECT 
                -- Dados básicos do contrato
                c.idcontrato,
                c.idhospedagem,
                c.idusuario,
                c.datainicio,
                c.datafim,
                c.datacriacao,
                c.dataatualizacao,
                c.status,
                
                -- Hospedagem
                h.nome as hospedagem_nome,
                COALESCE(h.valor_diaria, 0) as valor_diaria,
                
                -- Endereço da hospedagem
                e.numero as endereco_numero,
                e.complemento as endereco_complemento,
                l.nome as logradouro_nome,
                b.nome as bairro_nome,
                ci.nome as cidade_nome,
                es.nome as estado_nome,
                es.sigla as estado_sigla,
                cep.codigo as cep_codigo,
                
                -- Usuário
                u.nome as usuario_nome,
                u.email as usuario_email,
                u.telefone as usuario_telefone,
                
                -- Cálculo de quantidade de dias
                (CASE 
                    WHEN c.datafim IS NOT NULL AND c.datainicio IS NOT NULL 
                    THEN GREATEST(1, (c.datafim::date - c.datainicio::date))
                    ELSE 1 
                END) as quantidade_dias,
                
                -- Quantidade de pets
                COALESCE((SELECT COUNT(*) FROM contrato_pet cp WHERE cp.idcontrato = c.idcontrato), 0) as quantidade_pets,
                
                -- Valor da hospedagem
                (CASE 
                    WHEN h.valor_diaria IS NOT NULL AND h.valor_diaria > 0
                    THEN h.valor_diaria * 
                         (CASE 
                            WHEN c.datafim IS NOT NULL AND c.datainicio IS NOT NULL 
                            THEN GREATEST(1, (c.datafim::date - c.datainicio::date))
                            ELSE 1 
                         END) *
                         COALESCE((SELECT COUNT(*) FROM contrato_pet cp WHERE cp.idcontrato = c.idcontrato), 0)
                    ELSE 0
                END) as valor_hospedagem,
                
                -- Valor dos serviços
                COALESCE((SELECT SUM(cs.quantidade * cs.preco_unitario) 
                 FROM contratoservico cs 
                 WHERE cs.idcontrato = c.idcontrato), 0) as valor_servicos,
                
                -- Valor total do contrato
                ((CASE 
                    WHEN h.valor_diaria IS NOT NULL AND h.valor_diaria > 0
                    THEN h.valor_diaria * 
                         (CASE 
                            WHEN c.datafim IS NOT NULL AND c.datainicio IS NOT NULL 
                            THEN GREATEST(1, (c.datafim::date - c.datainicio::date))
                            ELSE 1 
                         END) *
                         COALESCE((SELECT COUNT(*) FROM contrato_pet cp WHERE cp.idcontrato = c.idcontrato), 0)
                    ELSE 0
                END) + 
                COALESCE((SELECT SUM(cs.quantidade * cs.preco_unitario) 
                 FROM contratoservico cs 
                 WHERE cs.idcontrato = c.idcontrato), 0)) as valor_total,
                
                -- Pets com serviços aninhados
                COALESCE(
                    (SELECT json_agg(
                        jsonb_build_object(
                            'idpet', p.idpet,
                            'nome', p.nome,
                            'sexo', p.sexo,
                            'nascimento', p.nascimento,
                            'porte_id', p.idporte,
                            'especie_id', p.idespecie,
                            'raca_id', p.idraca,
                            -- Serviços deste pet
                            'servicos', COALESCE(
                                (SELECT json_agg(
                                    jsonb_build_object(
                                        'idservico', s.idservico,
                                        'descricao', s.descricao,
                                        'quantidade', cs.quantidade,
                                        'preco_unitario', cs.preco_unitario,
                                        'preco_total', (cs.quantidade * cs.preco_unitario)
                                    )
                                )
                                FROM contratoservico cs
                                JOIN servico s ON cs.idservico = s.idservico
                                WHERE cs.idcontrato = c.idcontrato 
                                AND cs.idpet = p.idpet),
                                '[]'::json
                            ),
                            -- Valor total dos serviços deste pet
                            'valor_total_servicos', COALESCE(
                                (SELECT SUM(cs.quantidade * cs.preco_unitario)
                                 FROM contratoservico cs
                                 WHERE cs.idcontrato = c.idcontrato 
                                 AND cs.idpet = p.idpet),
                                0
                            )
                        )
                    )
                    FROM contrato_pet cp
                    JOIN pet p ON cp.idpet = p.idpet
                    WHERE cp.idcontrato = c.idcontrato),
                    '[]'::json
                ) as pets_com_servicos,
                
                -- Serviços gerais (que não estão associados a um pet específico)
                COALESCE(
                    (SELECT json_agg(jsonb_build_object(
                        'idservico', s.idservico,
                        'descricao', s.descricao,
                        'quantidade', cs.quantidade,
                        'preco_unitario', cs.preco_unitario,
                        'preco_total', (cs.quantidade * cs.preco_unitario)
                    ))
                    FROM contratoservico cs
                    JOIN servico s ON cs.idservico = s.idservico
                    WHERE cs.idcontrato = c.idcontrato 
                    AND cs.idpet IS NULL),
                    '[]'::json
                ) as servicos_gerais

            FROM contrato c
            
            -- Hospedagem
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            
            -- Endereço
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            
            -- Usuário
            LEFT JOIN usuario u ON c.idusuario = u.idusuario
            
            WHERE c.idusuario = $1
        `;

        const queryParams = [idUsuario];
        let paramCount = 1;

        // Adicionar filtro de status se houver
        if (status) {
            const statusArray = Array.isArray(status) ? status : [status];
            paramCount++;
            const placeholders = statusArray.map((_, idx) => `$${paramCount + idx}`).join(', ');
            query += ` AND c.status IN (${placeholders})`;
            queryParams.push(...statusArray);
            paramCount += statusArray.length;
        }

        // Adicionar filtro de data de início
        if (dataInicio) {
            paramCount++;
            query += ` AND c.datacriacao >= $${paramCount}`;
            queryParams.push(dataInicio);
        }

        // Adicionar filtro de data de fim
        if (dataFim) {
            paramCount++;
            query += ` AND c.datacriacao <= $${paramCount}`;
            queryParams.push(dataFim + ' 23:59:59'); // Inclui todo o dia
        }

        // Agrupar por
        query += ` 
            GROUP BY 
                c.idcontrato,
                h.idhospedagem,
                h.valor_diaria,
                e.idendereco,
                l.idlogradouro,
                b.idbairro,
                ci.idcidade,
                es.idestado,
                cep.idcep,
                u.idusuario`;

        // Validar e adicionar ordenação
        const camposOrdenaveis = ['datacriacao', 'dataatualizacao', 'datainicio', 'datafim', 'status'];
        const direcoesValidas = ['ASC', 'DESC'];
        
        const campoOrdenacao = camposOrdenaveis.includes(orderBy) ? orderBy : 'datacriacao';
        const direcao = direcoesValidas.includes(orderDirection.toUpperCase()) ? orderDirection.toUpperCase() : 'DESC';
        
        query += ` ORDER BY c.${campoOrdenacao} ${direcao}`;

        console.log('🔍 Executando query de filtro para usuário:', idUsuario);
        console.log('📊 Filtros aplicados:', { status, dataInicio, dataFim });
        console.log('📋 Query:', query.substring(0, 200) + '...');

        // Executar query
        const result = await client.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(200).json({ 
                success: true,
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

        // Função auxiliar para formatar valores monetários
        const formatarMoeda = (valor) => {
            const num = parseFloat(valor) || 0;
            return `R$ ${num.toFixed(2).replace('.', ',')}`;
        };

        // Função auxiliar para formatar números
        const formatarNumero = (valor) => {
            return parseFloat(valor) || 0;
        };

        // Formatar os dados para resposta (MESMO FORMATO DO lerContratos)
        const contratosFormatados = result.rows.map(contrato => {
            // Calcular status de pagamento
            let statusPagamento = 'pendente';
            switch (contrato.status) {
                case 'concluido':
                    statusPagamento = 'concluido';
                    break;
                case 'cancelado':
                case 'negado':
                    statusPagamento = 'cancelado';
                    break;
                case 'em_aprovacao':
                    statusPagamento = 'em_aprovacao';
                    break;
                case 'aprovado':
                    statusPagamento = 'aprovado';
                    break;
                case 'em_execucao':
                    statusPagamento = 'em_execucao';
                    break;
                default:
                    statusPagamento = 'pendente';
            }

            const valorDiaria = formatarNumero(contrato.valor_diaria);
            const valorHospedagem = formatarNumero(contrato.valor_hospedagem);
            const valorServicos = formatarNumero(contrato.valor_servicos);
            const valorTotal = formatarNumero(contrato.valor_total);
            const quantidadeDias = formatarNumero(contrato.quantidade_dias);
            const quantidadePets = formatarNumero(contrato.quantidade_pets);

            return {
                id: contrato.idcontrato,
                hospedagem: {
                    id: contrato.idhospedagem,
                    nome: contrato.hospedagem_nome || 'Não informado',
                    valorDiaria: valorDiaria,
                    endereco: {
                        numero: contrato.endereco_numero,
                        complemento: contrato.endereco_complemento,
                        logradouro: contrato.logradouro_nome,
                        bairro: contrato.bairro_nome,
                        cidade: contrato.cidade_nome,
                        estado: contrato.estado_nome,
                        sigla: contrato.estado_sigla,
                        cep: contrato.cep_codigo
                    }
                },
                usuario: {
                    id: contrato.idusuario,
                    nome: contrato.usuario_nome || 'Não informado',
                    email: contrato.usuario_email,
                    telefone: contrato.usuario_telefone
                },
                datas: {
                    inicio: contrato.datainicio,
                    fim: contrato.datafim,
                    criacao: contrato.datacriacao,
                    atualizacao: contrato.dataatualizacao
                },
                calculos: {
                    quantidadeDias: quantidadeDias,
                    quantidadePets: quantidadePets,
                    valorHospedagem: valorHospedagem,
                    valorServicos: valorServicos,
                    valorTotal: valorTotal
                },
                status: {
                    contrato: contrato.status || 'em_aprovacao',
                    pagamento: statusPagamento
                },
                pets: contrato.pets_com_servicos || [],
                servicosGerais: contrato.servicos_gerais || [],
                // Campos formatados para exibição
                formatado: {
                    periodo: `${quantidadeDias} dia(s)`,
                    pets: `${quantidadePets} pet(s)`,
                    valorDiaria: formatarMoeda(valorDiaria),
                    valorHospedagem: formatarMoeda(valorHospedagem),
                    valorServicos: formatarMoeda(valorServicos),
                    valorTotal: formatarMoeda(valorTotal)
                }
            };
        });

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
            const valorTotal = parseFloat(contrato.valor_total) || 0;
            
            if (!estatisticas.porStatus[statusContrato]) {
                estatisticas.porStatus[statusContrato] = {
                    quantidade: 0,
                    valorTotal: 0,
                    descricao: statusMap[statusContrato] || 'Desconhecido'
                };
            }
            
            estatisticas.porStatus[statusContrato].quantidade++;
            estatisticas.porStatus[statusContrato].valorTotal += valorTotal;
            estatisticas.valores.total += valorTotal;
        });

        // Calcular valor médio
        estatisticas.valores.medio = estatisticas.total > 0 ? 
            estatisticas.valores.total / estatisticas.total : 0;

        res.status(200).json({
            success: true,
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
            success: false,
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