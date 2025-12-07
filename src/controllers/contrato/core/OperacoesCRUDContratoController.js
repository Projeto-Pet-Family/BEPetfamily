const pool = require('../../../connections/SQLConnections.js');
/* const { buscarContratoComRelacionamentos, validarStatus, validarDatas, construirQueryUpdate, statusNaoEditaveis, statusMap } = require('../ContratoController'); */
const { 
    buscarContratoComRelacionamentos, 
    validarStatus, 
    validarDatas, 
    construirQueryUpdate, 
    statusNaoEditaveis, 
    statusMap 
} = require('../ContratoUtils.js');

const lerContratos = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
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

        const result = await client.query(query);
        
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

        res.status(200).json({
            success: true,
            count: contratosFormatados.length,
            data: contratosFormatados
        });

    } catch (error) {
        console.error('Erro ao listar contratos:', error);
        res.status(500).json({ 
            success: false,
            message: 'Erro ao listar contratos', 
            error: error.message 
        });
    } finally { 
        if (client) client.release(); 
    }
};

const buscarContratoPorId = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const contratoCompleto = await buscarContratoComRelacionamentos(client, req.params.idContrato);
        if (!contratoCompleto) return res.status(404).json({ message: 'Contrato não encontrado' });
        res.status(200).json(contratoCompleto);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar contrato', error: error.message });
    } finally { if (client) client.release(); }
};

const criarContrato = async (req, res) => {
    let client;
    let idContrato; // Declarar no escopo superior
    
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const { 
            idHospedagem, 
            idUsuario, 
            status = 'em_aprovacao', 
            dataInicio, 
            dataFim, 
            pets = [], 
            servicosPorPet = []
        } = req.body;

        console.log('🟢 === INICIANDO CRIAÇÃO DE CONTRATO ===');
        console.log('📥 Dados recebidos:', { idHospedagem, idUsuario, dataInicio, dataFim, pets });

        // Validações básicas
        if (!idHospedagem || !idUsuario || !dataInicio) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'idHospedagem, idUsuario e dataInicio são obrigatórios' });
        }

        // Verificar existência da hospedagem e usuário
        const [hospedagem, usuario] = await Promise.all([
            client.query('SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]),
            client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]),
        ]);

        if (hospedagem.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }
        
        if (usuario.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        // Validar pets
        if (pets.length > 0) {
            const petsValidos = await client.query(
                'SELECT idpet FROM pet WHERE idpet = ANY($1) AND idusuario = $2',
                [pets, idUsuario]
            );
            
            if (petsValidos.rows.length !== pets.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Um ou mais pets não pertencem ao usuário' });
            }
        }

        // Preparar serviços
        let servicosPorPetValidos = [];
        if (servicosPorPet && servicosPorPet.length > 0) {
            const todosServicosIds = servicosPorPet.flatMap(item => item.servicos || []);
            
            if (todosServicosIds.length > 0) {
                const servicosValidos = await client.query(
                    'SELECT idservico, preco FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true',
                    [todosServicosIds, idHospedagem]
                );
                
                if (servicosValidos.rows.length !== new Set(todosServicosIds).size) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'Um ou mais serviços não estão disponíveis para esta hospedagem' });
                }

                // Processar serviços por pet
                servicosPorPet.forEach(item => {
                    if (item.servicos && item.servicos.length > 0) {
                        item.servicos.forEach(idServico => {
                            const servicoInfo = servicosValidos.rows.find(s => s.idservico === idServico);
                            servicosPorPetValidos.push({
                                idPet: item.idPet,
                                idServico: idServico,
                                precoUnitario: servicoInfo.preco
                            });
                        });
                    }
                });
            }
        }

        // Verificar se já existe contrato idêntico
        const contratoIdentico = await client.query(
            `SELECT idcontrato FROM contrato WHERE idhospedagem = $1 AND idusuario = $2 AND datainicio = $3 
             AND COALESCE(datafim, $4) = COALESCE($4, datafim) AND status IN ('em_aprovacao', 'aprovado', 'em_execucao') LIMIT 1`,
            [idHospedagem, idUsuario, dataInicio, dataFim]
        );

        if (contratoIdentico.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Já existe um contrato idêntico ativo' });
        }

        // 🟢 **1. CRIAR O CONTRATO**
        console.log('🟢 CRIANDO REGISTRO NA TABELA CONTRATO...');
        
        const contratoResult = await client.query(
            'INSERT INTO contrato (idhospedagem, idusuario, status, datainicio, datafim) VALUES ($1, $2, $3, $4, $5) RETURNING idcontrato',
            [idHospedagem, idUsuario, status, dataInicio, dataFim]
        );
        
        console.log('✅ CONTRATO CRIADO COM SUCESSO!');
        console.log('📦 Resultado da inserção:', contratoResult.rows);
        
        idContrato = contratoResult.rows[0].idcontrato;
        console.log('✅ ID do contrato gerado:', idContrato);
        
        // 🟢 **2. INSERIR PETS**
        if (pets.length > 0) {
            console.log(`🐕 Inserindo ${pets.length} pet(s) no contrato...`);
            
            // Método seguro usando parámetros
            const petsValues = pets.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(',');
            const petsParams = pets.flatMap(petId => [idContrato, petId]);
            
            await client.query(
                `INSERT INTO contrato_pet (idcontrato, idpet) VALUES ${petsValues}`,
                petsParams
            );
            
            console.log('✅ Pets inseridos com sucesso!');
        }
        
        // 🟢 **3. INSERIR SERVIÇOS**
        if (servicosPorPetValidos.length > 0) {
            console.log(`🛎️ Inserindo ${servicosPorPetValidos.length} serviço(s) no contrato...`);
            
            const servicosValues = servicosPorPetValidos.map((_, index) => 
                `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${index * 5 + 4}, $${index * 5 + 5})`
            ).join(',');
            
            const servicosParams = servicosPorPetValidos.flatMap(servico => [
                idContrato,
                servico.idServico,
                servico.idPet,
                1, // quantidade
                servico.precoUnitario
            ]);
            
            await client.query(
                `INSERT INTO contratoservico (idcontrato, idservico, idpet, quantidade, preco_unitario) VALUES ${servicosValues}`,
                servicosParams
            );
            
            console.log('✅ Serviços inseridos com sucesso!');
        }

        // 🟢 **4. COMMIT DA TRANSAÇÃO**
        await client.query('COMMIT');
        console.log('✅ TRANSACTION COMMITADA COM SUCESSO!');
        
        // 🟢 **5. BUSCAR CONTRATO COMPLETO**
        console.log('🔍 Buscando contrato completo...');
        const contratoCompleto = await buscarContratoComRelacionamentos(idContrato);
        
        // 🟢 **6. RESPOSTA DE SUCESSO**
        res.status(201).json({ 
            success: true,
            message: 'Contrato criado com sucesso',
            data: contratoCompleto || {
                idcontrato: idContrato,
                idhospedagem: idHospedagem,
                idusuario: idUsuario,
                status: status,
                datainicio: dataInicio,
                datafim: dataFim,
                pets_count: pets.length,
                servicos_count: servicosPorPetValidos.length
            },
            resumo: {
                idContrato: idContrato,
                petsAdicionados: pets.length,
                servicosAdicionados: servicosPorPetValidos.length
            }
        });
        
    } catch (error) {
        console.error('🔴 ERRO GERAL:', error.message);
        console.error('🔴 Stack trace:', error.stack);
        
        if (client) {
            try {
                await client.query('ROLLBACK');
                console.log('🔄 ROLLBACK realizado devido ao erro');
            } catch (rollbackError) {
                console.error('❌ Erro ao fazer ROLLBACK:', rollbackError.message);
            }
        }
        
        const statusCode = error.message.includes('timeout') ? 408 : 500;
        res.status(statusCode).json({ 
            success: false,
            message: 'Erro ao criar contrato', 
            error: error.message,
            detalhes: error.detail || 'Nenhum detalhe adicional'
        });
    } finally { 
        if (client) {
            client.release();
            console.log('🔌 Conexão liberada');
        }
    }
};

const atualizarContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { idHospedagem, idUsuario, status, dataInicio, dataFim } = req.body;

        const contratoExistente = await client.query(
            'SELECT * FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        if (status && !validarStatus(status)) {
            return res.status(400).json({ message: 'Status inválido' });
        }

        validarDatas(dataInicio, dataFim);

        const contratoAtual = contratoExistente.rows[0];
        if (statusNaoEditaveis.includes(contratoAtual.status)) {
            return res.status(400).json({ 
                message: `Não é possível atualizar um contrato com status "${statusMap[contratoAtual.status]}"`,
                error: 'STATUS_NAO_EDITAVEL'
            });
        }

        if (idHospedagem) {
            const hospedagem = await client.query(
                'SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1',
                [idHospedagem]
            );
            if (hospedagem.rows.length === 0) {
                return res.status(400).json({ message: 'Hospedagem não encontrada' });
            }
        }

        if (idUsuario) {
            const usuario = await client.query(
                'SELECT idusuario FROM usuario WHERE idusuario = $1',
                [idUsuario]
            );
            if (usuario.rows.length === 0) {
                return res.status(400).json({ message: 'Usuário não encontrado' });
            }
        }

        const { query, values } = construirQueryUpdate({
            idhospedagem: idHospedagem,
            idusuario: idUsuario,
            status: status,
            datainicio: dataInicio,
            datafim: dataFim
        }, idContrato);

        await client.query(query, values);
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Contrato atualizado com sucesso',
            data: contratoCompleto,
            alteracoes: {
                idHospedagem: idHospedagem !== undefined,
                idUsuario: idUsuario !== undefined,
                status: status !== undefined,
                dataInicio: dataInicio !== undefined,
                dataFim: dataFim !== undefined
            }
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'Erro ao atualizar contrato', 
            error: error.message,
            errorCode: error.code 
        });
    } finally {
        if (client) await client.release();
    }
};

const excluirContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const contratoExistente = await client.query(
            'SELECT * FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contrato = contratoExistente.rows[0];
        const statusBloqueadosExclusao = ['em_execucao', 'concluido'];
        if (statusBloqueadosExclusao.includes(contrato.status)) {
            return res.status(400).json({ 
                message: `Não é possível excluir um contrato com status "${statusMap[contrato.status]}"`,
                statusAtual: contrato.status,
                descricaoStatus: statusMap[contrato.status],
                erro: 'EXCLUSAO_BLOQUEADA'
            });
        }

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        await client.query('BEGIN');

        await client.query('DELETE FROM contratoservico WHERE idcontrato = $1', [idContrato]);
        await client.query('DELETE FROM contrato_pet WHERE idcontrato = $1', [idContrato]);
        const deleteResult = await client.query(
            'DELETE FROM contrato WHERE idcontrato = $1 RETURNING *',
            [idContrato]
        );

        await client.query('COMMIT');

        res.status(200).json({
            message: 'Contrato excluído com sucesso',
            data: contratoCompleto,
            exclusao: {
                contratoExcluido: deleteResult.rows[0],
                servicosRemovidos: contratoCompleto.servicos_por_pet 
                    ? Object.values(contratoCompleto.servicos_por_pet).reduce((total, pet) => total + pet.quantidadeServicos, 0)
                    : 0,
                petsRemovidos: contratoCompleto.pets?.length || 0,
                valorTotalPerdido: contratoCompleto.calculo_valores?.valor_total_contrato || 0
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o contrato pois está sendo utilizado em outros registros'
            : 'Erro ao excluir contrato';
        
        res.status(statusCode).json({ 
            message, 
            error: error.message,
            errorCode: error.code,
            errorDetail: error.detail 
        });
    } finally {
        if (client) await client.release();
    }
};

module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    excluirContrato
};