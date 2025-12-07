const pool = require('../../connections/SQLConnections.js');
/* const { buscarContratoComRelacionamentos, validarStatus } = require('./ContratoController.js'); */
const { 
    buscarContratoComRelacionamentos, 
    validarStatus, 
    validarDatas, 
    construirQueryUpdate, 
    statusNaoEditaveis, 
    statusMap 
} = require('./ContratoUtils.js');

const buscarContratosPorUsuario = async (req, res) => {
    let client;
    try {
        const { idUsuario } = req.params;
        
        if (!idUsuario || isNaN(idUsuario)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID do usuário inválido' 
            });
        }

        client = await pool.connect();
        
        console.log(`📋 Listando contratos do usuário ID: ${idUsuario}`);

        const query = `
            SELECT 
                -- Dados básicos do contrato
                c.idcontrato,
                c.idhospedagem,
                c.idusuario,
                c.datainicio,
                c.datafim,
                c.datacriacao,
                c.dataatualizacao,
                COALESCE(c.status, 'em_aprovacao') as status,
                
                -- Hospedagem
                COALESCE(h.nome, 'Hospedagem não informada') as hospedagem_nome,
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
                COALESCE(u.nome, 'Usuário não informado') as usuario_nome,
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
                    WHEN COALESCE(h.valor_diaria, 0) > 0
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
                    WHEN COALESCE(h.valor_diaria, 0) > 0
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
                            'nome', COALESCE(p.nome, 'Pet sem nome'),
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
                u.idusuario
                
            ORDER BY c.datacriacao DESC, c.idcontrato DESC`;

        const result = await client.query(query, [idUsuario]);
        
        console.log(`✅ ${result.rows.length} contratos encontrados para o usuário ${idUsuario}`);

        // Função auxiliar para formatar valores monetários
        const formatarMoeda = (valor) => {
            const num = parseFloat(valor) || 0;
            return `R$ ${num.toFixed(2).replace('.', ',')}`;
        };

        // Função auxiliar para formatar números
        const formatarNumero = (valor) => {
            return parseFloat(valor) || 0;
        };

        // Formatar os dados para resposta
        const contratosFormatados = result.rows.map(contrato => {
            // Calcular status de pagamento baseado no status do contrato
            let statusPagamento = 'pendente';
            const statusContrato = contrato.status || 'em_aprovacao';
            
            switch (statusContrato) {
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
                    nome: contrato.hospedagem_nome,
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
                    nome: contrato.usuario_nome,
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
                    contrato: statusContrato,
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

        res.status(200).json({
            success: true,
            count: contratosFormatados.length,
            data: contratosFormatados
        });

    } catch (error) {
        console.error('❌ Erro ao listar contratos do usuário:', error);
        res.status(500).json({ 
            success: false,
            message: 'Erro ao buscar contratos do usuário', 
            error: error.message 
        });
    } finally { 
        if (client) client.release(); 
    }
};

const buscarContratosPorUsuarioEStatus = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        const { status } = req.query;

        if (!idUsuario) return res.status(400).json({ message: 'idUsuario é obrigatório' });

        const usuario = await client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]);
        if (usuario.rows.length === 0) return res.status(404).json({ message: 'Usuário não encontrado' });

        let query = `
            SELECT c.*, h.nome as hospedagem_nome, e.numero as endereco_numero,
                   e.complemento as endereco_complemento, l.nome as logradouro_nome,
                   b.nome as bairro_nome, ci.nome as cidade_nome, es.nome as estado_nome,
                   es.sigla as estado_sigla, cep.codigo as cep_codigo
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            WHERE c.idusuario = $1
        `;

        const values = [idUsuario];
        if (status) {
            if (!validarStatus(status)) {
                return res.status(400).json({ message: 'Status inválido' });
            }
            query += ` AND c.status = $2`;
            values.push(status);
        }

        query += ` ORDER BY c.datainicio DESC, c.datacriacao DESC`;

        const result = await client.query(query, values);
        
        const contratosCompletos = await Promise.all(
            result.rows.map(contrato => buscarContratoComRelacionamentos(client, contrato.idcontrato))
        );

        res.status(200).json(contratosCompletos);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar contratos do usuário', error: error.message });
    } finally {
        if (client) await client.release();
    }
};

module.exports = {
    buscarContratosPorUsuario,
    buscarContratosPorUsuarioEStatus
};