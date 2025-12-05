const pool = require('../../connections/SQLConnections.js');

// Configurações
const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
const statusMap = {
    'em_aprovacao': 'Em aprovação',
    'aprovado': 'Aprovado',
    'em_execucao': 'Em execução',
    'concluido': 'Concluído',
    'negado': 'Negado',
    'cancelado': 'Cancelado'
};
const statusNaoEditaveis = ['concluido', 'cancelado', 'negado'];

// Funções auxiliares
const formatarEndereco = (contrato) => {
    const enderecoParts = [];
    if (contrato.logradouro_nome) enderecoParts.push(contrato.logradouro_nome);
    if (contrato.endereco_numero) enderecoParts.push(contrato.endereco_numero.toString());
    if (contrato.endereco_complemento) enderecoParts.push(contrato.endereco_complemento);
    if (contrato.bairro_nome) enderecoParts.push(contrato.bairro_nome);
    if (contrato.cidade_nome) enderecoParts.push(contrato.cidade_nome);
    if (contrato.estado_sigla) enderecoParts.push(contrato.estado_sigla);
    if (contrato.cep_codigo) enderecoParts.push(`CEP: ${contrato.cep_codigo}`);
    return enderecoParts.join(', ');
};

const validarStatus = (status) => statusValidos.includes(status);

const validarDatas = (dataInicio, dataFim) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (dataInicio && new Date(dataInicio) < hoje) {
        throw new Error('Data início não pode ser anterior à data atual');
    }
    if (dataFim && dataInicio && new Date(dataFim) < new Date(dataInicio)) {
        throw new Error('Data fim não pode ser anterior à data início');
    }
};

const construirQueryUpdate = (campos, idContrato) => {
    const updateFields = [], values = [];
    Object.entries(campos).forEach(([key, value], i) => {
        if (value !== undefined) {
            updateFields.push(`${key} = $${i + 1}`);
            values.push(value);
        }
    });
    if (updateFields.length === 0) throw new Error('Nenhum campo válido para atualização');
    values.push(idContrato);
    updateFields.push('dataatualizacao = CURRENT_TIMESTAMP');
    return {
        query: `UPDATE contrato SET ${updateFields.join(', ')} WHERE idcontrato = $${values.length} RETURNING *`,
        values
    };
};

// Cálculos de valores
const calcularValoresContrato = (contrato, pets = [], servicos = []) => {
    const valorDiaria = parseFloat(contrato.valor_diaria || 0);
    const quantidadeDias = contrato.duracao_dias || 1;
    const quantidadePets = pets.length;
    
    const valorTotalHospedagem = valorDiaria * quantidadeDias * quantidadePets;
    const totalServicos = servicos.reduce((total, s) => total + (parseFloat(s.subtotal) || 0), 0);
    
    const formatar = (valor) => `R$ ${valor.toFixed(2).replace('.', ',')}`;
    
    return {
        valor_diaria: valorDiaria,
        quantidade_dias: quantidadeDias,
        quantidade_pets: quantidadePets,
        valor_total_hospedagem: valorTotalHospedagem,
        valor_total_servicos: totalServicos,
        valor_total_contrato: valorTotalHospedagem + totalServicos,
        formatado: {
            valorDiaria: formatar(valorDiaria),
            valorTotalHospedagem: formatar(valorTotalHospedagem),
            valorTotalServicos: formatar(totalServicos),
            valorTotalContrato: formatar(valorTotalHospedagem + totalServicos),
            periodo: `${quantidadeDias} dia(s)`,
            pets: `${quantidadePets} pet(s)`
        }
    };
};

// Busca completa de contrato
const buscarContratoComRelacionamentos = async (client, idContrato) => {
    try {
        const query = `
            SELECT c.*, h.nome as hospedagem_nome, h.valor_diaria,
                   e.idendereco, e.numero as endereco_numero, e.complemento as endereco_complemento,
                   l.nome as logradouro_nome, b.nome as bairro_nome, ci.nome as cidade_nome,
                   es.nome as estado_nome, es.sigla as estado_sigla, cep.codigo as cep_codigo,
                   u.nome as usuario_nome, u.email as usuario_email
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            LEFT JOIN usuario u ON c.idusuario = u.idusuario
            WHERE c.idcontrato = $1`;
        
        const contratoResult = await client.query(query, [idContrato]);
        if (!contratoResult.rows[0]) return null;

        const contrato = contratoResult.rows[0];
        contrato.hospedagem_endereco = formatarEndereco(contrato);

        const [petsResult, servicosResult] = await Promise.all([
            client.query(`SELECT cp.idcontrato_pet, p.* FROM contrato_pet cp JOIN pet p ON cp.idpet = p.idpet WHERE cp.idcontrato = $1`, [idContrato]),
            client.query(`SELECT cs.*, s.descricao, s.preco as preco_atual, (cs.quantidade * cs.preco_unitario) as subtotal 
                         FROM contratoservico cs JOIN servico s ON cs.idservico = s.idservico 
                         WHERE cs.idcontrato = $1 ORDER BY s.descricao`, [idContrato])
        ]);

        contrato.pets = petsResult.rows;
        contrato.servicos = servicosResult.rows;

        if (contrato.datainicio && contrato.datafim) {
            const diffTime = Math.abs(new Date(contrato.datafim) - new Date(contrato.datainicio));
            contrato.duracao_dias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
            contrato.duracao_dias = null;
        }

        contrato.calculo_valores = calcularValoresContrato(contrato, contrato.pets, contrato.servicos);
        contrato.status_descricao = statusMap[contrato.status] || 'Desconhecido';

        return contrato;
    } catch (error) {
        console.error('Erro ao buscar contrato com relacionamentos:', error);
        throw error;
    }
};

// Controladores principais
const lerContratos = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const query = `
            SELECT c.*, h.nome as hospedagem_nome, h.valor_diaria,
                   e.numero as endereco_numero, e.complemento as endereco_complemento,
                   l.nome as logradouro_nome, b.nome as bairro_nome, ci.nome as cidade_nome,
                   es.nome as estado_nome, es.sigla as estado_sigla, cep.codigo as cep_codigo,
                   u.nome as usuario_nome
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            LEFT JOIN usuario u ON c.idusuario = u.idusuario
            ORDER BY c.datacriacao DESC`;
        
        const result = await client.query(query);
        const contratosCompletos = await Promise.all(
            result.rows.map(contrato => buscarContratoComRelacionamentos(client, contrato.idcontrato))
        );
        res.status(200).json(contratosCompletos);
    } catch (error) {
        console.error('Erro ao listar contratos:', error);
        res.status(500).json({ message: 'Erro ao listar contratos', error: error.message });
    } finally { if (client) client.release(); }
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
    try {
        client = await pool.connect();
        await client.query('SET statement_timeout = 30000');
        await client.query('BEGIN');

        const { idHospedagem, idUsuario, status = 'em_aprovacao', dataInicio, dataFim, pets = [], servicos = [] } = req.body;

        if (!idHospedagem || !idUsuario || !dataInicio) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'idHospedagem, idUsuario e dataInicio são obrigatórios' });
        }
        if (!validarStatus(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status inválido' });
        }
        validarDatas(dataInicio, dataFim);

        const [hospedagem, usuario, petsValidos, servicosValidos, contratoIdentico] = await Promise.all([
            client.query('SELECT idhospedagem, valor_diaria FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]),
            client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]),
            pets.length > 0 ? client.query('SELECT idpet FROM pet WHERE idpet = ANY($1) AND idusuario = $2', [pets, idUsuario]) : { rows: [] },
            servicos.length > 0 ? client.query('SELECT idservico, preco FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true', [servicos.map(s => s.idservico), idHospedagem]) : { rows: [] },
            client.query(`SELECT idcontrato FROM contrato WHERE idhospedagem = $1 AND idusuario = $2 AND datainicio = $3 
                         AND COALESCE(datafim, $4) = COALESCE($4, datafim) AND status IN ('em_aprovacao', 'aprovado', 'em_execucao') LIMIT 1`,
                [idHospedagem, idUsuario, dataInicio, dataFim])
        ]);

        if (hospedagem.rows.length === 0) throw new Error('Hospedagem não encontrada');
        if (usuario.rows.length === 0) throw new Error('Usuário não encontrado');
        if (pets.length > 0 && petsValidos.rows.length !== pets.length) throw new Error('Um ou mais pets não pertencem ao usuário');
        if (servicos.length > 0 && servicosValidos.rows.length !== servicos.length) throw new Error('Um ou mais serviços não estão disponíveis');
        if (contratoIdentico.rows.length > 0) throw new Error('Já existe um contrato idêntico ativo');

        const contratoResult = await client.query(
            'INSERT INTO contrato (idhospedagem, idusuario, status, datainicio, datafim) VALUES ($1, $2, $3, $4, $5) RETURNING idcontrato',
            [idHospedagem, idUsuario, status, dataInicio, dataFim]
        );
        const idContrato = contratoResult.rows[0].idcontrato;

        if (pets.length > 0) {
            const petsValues = pets.map(idPet => `(${idContrato}, ${idPet})`).join(',');
            await client.query(`INSERT INTO contrato_pet (idcontrato, idpet) VALUES ${petsValues}`);
        }

        if (servicos.length > 0) {
            const servicosValues = servicos.map(servico => {
                const precoUnitario = servicosValidos.rows.find(s => s.idservico === servico.idservico)?.preco || 0;
                const quantidade = servico.quantidade || 1;
                return `(${idContrato}, ${servico.idservico}, ${quantidade}, ${precoUnitario})`;
            }).join(',');
            await client.query(`INSERT INTO contratoservico (idcontrato, idservico, quantidade, preco_unitario) VALUES ${servicosValues}`);
        }

        await client.query('COMMIT');
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        res.status(201).json({ message: 'Contrato criado com sucesso', data: contratoCompleto });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        const statusCode = error.message.includes('timeout') ? 408 : 500;
        res.status(statusCode).json({ message: 'Erro ao criar contrato', error: error.message });
    } finally { if (client) client.release(); }
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
                servicosRemovidos: contratoCompleto.servicos?.length || 0,
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

const buscarContratosPorUsuario = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        
        const usuario = await client.query(
            'SELECT idusuario FROM usuario WHERE idusuario = $1',
            [idUsuario]
        );
        if (usuario.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const query = `
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
            ORDER BY 
                CASE 
                    WHEN c.status = 'em_aprovacao' THEN 1
                    WHEN c.status = 'aprovado' THEN 2
                    WHEN c.status = 'em_execucao' THEN 3
                    WHEN c.status = 'concluido' THEN 4
                    WHEN c.status = 'negado' THEN 5
                    WHEN c.status = 'cancelado' THEN 6
                    ELSE 7
                END,
                c.datainicio DESC,
                c.datacriacao DESC
        `;

        const result = await client.query(query, [idUsuario]);
        
        const contratosCompletos = await Promise.all(
            result.rows.map(async (contrato) => {
                const contratoComEndereco = {
                    ...contrato,
                    hospedagem_endereco: formatarEndereco(contrato)
                };
                return await buscarContratoComRelacionamentos(client, contrato.idcontrato);
            })
        );

        const estatisticas = {
            total_contratos: contratosCompletos.length,
            por_status: contratosCompletos.reduce((acc, contrato) => {
                acc[contrato.status] = (acc[contrato.status] || 0) + 1;
                return acc;
            }, {}),
            valor_total: contratosCompletos.reduce((total, contrato) => 
                total + (contrato.calculo_valores?.valor_total_contrato || 0), 0
            ),
            pets_total: contratosCompletos.reduce((total, contrato) => 
                total + (contrato.pets?.length || 0), 0
            )
        };

        res.status(200).json({
            contratos: contratosCompletos,
            estatisticas: estatisticas,
            usuario: {
                id: idUsuario,
                total_contratos: estatisticas.total_contratos
            }
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'Erro ao buscar contratos do usuário', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

const adicionarPetContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { idContrato } = req.params;
        const { pets } = req.body;

        if (!pets || !Array.isArray(pets) || pets.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Lista de pets é obrigatória' });
        }

        // Verificar se há IDs duplicados na requisição
        const petsUnicos = [...new Set(pets)];
        if (petsUnicos.length !== pets.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Não é permitido adicionar o mesmo pet múltiplas vezes' });
        }

        const contrato = await client.query(
            'SELECT c.*, h.valor_diaria FROM contrato c JOIN hospedagem h ON c.idhospedagem = h.idhospedagem WHERE c.idcontrato = $1',
            [idContrato]
        );
        if (contrato.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: `Não é possível adicionar pets a um contrato com status "${statusMap[contrato.rows[0].status]}"`
            });
        }

        // Verificar quais pets já estão no contrato
        const petsExistentes = await client.query(
            'SELECT idpet FROM contrato_pet WHERE idcontrato = $1 AND idpet = ANY($2)',
            [idContrato, pets]
        );

        if (petsExistentes.rows.length > 0) {
            await client.query('ROLLBACK');
            const petsExistentesIds = petsExistentes.rows.map(p => p.idpet);
            return res.status(400).json({ 
                message: 'Um ou mais pets já estão vinculados a este contrato',
                petsExistentes: petsExistentesIds
            });
        }

        const petsValidos = await client.query(
            'SELECT idpet FROM pet WHERE idpet = ANY($1) AND idusuario = $2',
            [pets, contrato.rows[0].idusuario]
        );

        if (petsValidos.rows.length !== pets.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Um ou mais pets não pertencem ao usuário do contrato' });
        }

        const petsInseridos = [];
        for (const idPet of pets) {
            const result = await client.query(
                'INSERT INTO contrato_pet (idcontrato, idpet) VALUES ($1, $2) RETURNING *',
                [idContrato, idPet]
            );
            petsInseridos.push(result.rows[0]);
        }

        await client.query('COMMIT');
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        
        const valorDiaria = parseFloat(contrato.rows[0].valor_diaria || 0);
        const duracaoDias = contratoCompleto.duracao_dias || 1;
        const valorAdicionalPorPet = valorDiaria * duracaoDias;
        const valorTotalAdicional = valorAdicionalPorPet * pets.length;

        res.status(200).json({
            message: 'Pet(s) adicionado(s) com sucesso',
            petsAdicionados: petsInseridos,
            data: contratoCompleto,
            atualizacao_valores: {
                valor_adicional_por_pet: valorAdicionalPorPet,
                valor_total_adicional: valorTotalAdicional,
                valor_total_atualizado: contratoCompleto.calculo_valores.valor_total_contrato
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ message: 'Erro ao adicionar pet ao contrato', error: error.message });
    } finally { if (client) client.release(); }
};

const adicionarServicoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { idContrato } = req.params;
        const { servicos } = req.body;

        if (!servicos || !Array.isArray(servicos) || servicos.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Lista de serviços é obrigatória' });
        }

        // Verificar se há serviços duplicados na requisição
        const servicosIds = servicos;
        const servicosUnicos = [...new Set(servicosIds)];
        if (servicosUnicos.length !== servicos.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Não é permitido adicionar o mesmo serviço múltiplas vezes na mesma requisição' });
        }

        const contrato = await client.query(
            'SELECT c.*, h.valor_diaria FROM contrato c JOIN hospedagem h ON c.idhospedagem = h.idhospedagem WHERE c.idcontrato = $1',
            [idContrato]
        );
        if (contrato.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: `Não é possível adicionar serviços a um contrato com status "${statusMap[contrato.rows[0].status]}"`
            });
        }

        // Verificar quais serviços já estão no contrato
        const servicosExistentes = await client.query(
            'SELECT idservico FROM contratoservico WHERE idcontrato = $1 AND idservico = ANY($2)',
            [idContrato, servicosIds]
        );

        if (servicosExistentes.rows.length > 0) {
            await client.query('ROLLBACK');
            const servicosExistentesIds = servicosExistentes.rows.map(s => s.idservico);
            return res.status(400).json({ 
                message: 'Um ou mais serviços já estão vinculados a este contrato',
                servicosExistentes: servicosExistentesIds
            });
        }

        // Buscar informações dos serviços
        const servicosValidos = await client.query(
            'SELECT idservico, preco FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true',
            [servicosIds, contrato.rows[0].idhospedagem]
        );

        if (servicosValidos.rows.length !== servicos.length) {
            await client.query('ROLLBACK');
            
            // Identificar quais serviços não são válidos
            const servicosValidosIds = servicosValidos.rows.map(s => s.idservico);
            const servicosInvalidos = servicosIds.filter(id => !servicosValidosIds.includes(id));
            
            return res.status(400).json({ 
                message: 'Um ou mais serviços não estão disponíveis para esta hospedagem',
                servicosInvalidos: servicosInvalidos
            });
        }

        const servicosInseridos = [];
        for (const idServico of servicosIds) {
            const servicoInfo = servicosValidos.rows.find(s => s.idservico === idServico);
            const precoUnitario = servicoInfo.preco;
            const quantidade = 1; // Quantidade fixa em 1
            
            const result = await client.query(
                'INSERT INTO contratoservico (idcontrato, idservico, quantidade, preco_unitario) VALUES ($1, $2, $3, $4) RETURNING *',
                [idContrato, idServico, quantidade, precoUnitario]
            );
            servicosInseridos.push(result.rows[0]);
        }

        await client.query('COMMIT');
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        
        const valorServicosAdicional = servicosInseridos.reduce((sum, s) => sum + (s.preco_unitario * s.quantidade), 0);
        
        res.status(200).json({
            message: 'Serviço(s) adicionado(s) com sucesso',
            servicosAdicionados: servicosInseridos,
            data: contratoCompleto,
            atualizacao_valores: {
                valor_servicos_adicional: valorServicosAdicional,
                valor_total_atualizado: contratoCompleto.calculo_valores.valor_total_contrato
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Erro detalhado:', error);
        res.status(500).json({ message: 'Erro ao adicionar serviço ao contrato', error: error.message });
    } finally { if (client) client.release(); }
};

const atualizarDatasContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { dataInicio, dataFim } = req.body;

        // Validação básica
        if (!dataInicio && !dataFim) {
            return res.status(400).json({ 
                success: false,
                message: 'Nenhuma data fornecida para atualização' 
            });
        }

        // Construir query dinamicamente
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        if (dataInicio) {
            // Aceita string ou número, o PostgreSQL converterá automaticamente
            updates.push(`datainicio = $${paramIndex}`);
            values.push(dataInicio);
            paramIndex++;
        }
        
        if (dataFim) {
            updates.push(`datafim = $${paramIndex}`);
            values.push(dataFim);
            paramIndex++;
        }
        
        // Sempre atualizar dataatualizacao
        updates.push(`dataatualizacao = CURRENT_TIMESTAMP`);
        
        values.push(idContrato);
        
        const query = `
            UPDATE contrato 
            SET ${updates.join(', ')}
            WHERE idcontrato = $${paramIndex}
            RETURNING *
        `;

        console.log('Executando query:', { query, values });

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
        
        // Mensagem amigável para o erro específico
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

const excluirServicoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idServico } = req.params;

        const contrato = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contrato.rows.length === 0) return res.status(404).json({ message: 'Contrato não encontrado' });

        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            return res.status(400).json({ 
                message: `Não é possível remover serviços de um contrato com status "${statusMap[contrato.rows[0].status]}"`
            });
        }

        const servico = await client.query(
            'SELECT cs.*, s.descricao FROM contratoservico cs JOIN servico s ON cs.idservico = s.idservico WHERE cs.idcontrato = $1 AND cs.idservico = $2',
            [idContrato, idServico]
        );
        if (servico.rows.length === 0) return res.status(404).json({ message: 'Serviço não encontrado no contrato' });

        const valorRemovido = servico.rows[0].quantidade * servico.rows[0].preco_unitario;

        const deleteResult = await client.query(
            'DELETE FROM contratoservico WHERE idcontrato = $1 AND idservico = $2 RETURNING *',
            [idContrato, idServico]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Serviço removido do contrato com sucesso',
            servicoExcluido: { ...deleteResult.rows[0], descricao: servico.rows[0].descricao },
            impacto_financeiro: {
                valor_removido: valorRemovido,
                valor_total_atualizado: contratoCompleto.calculo_valores.valor_total_contrato
            },
            data: contratoCompleto
        });
    } catch (error) {
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o serviço pois está vinculado a outros registros'
            : 'Erro ao excluir serviço do contrato';
        res.status(statusCode).json({ message, error: error.message });
    } finally { if (client) client.release(); }
};

const excluirPetContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idPet } = req.params;

        const contrato = await client.query(
            'SELECT c.*, h.valor_diaria FROM contrato c JOIN hospedagem h ON c.idhospedagem = h.idhospedagem WHERE c.idcontrato = $1',
            [idContrato]
        );
        if (contrato.rows.length === 0) return res.status(404).json({ message: 'Contrato não encontrado' });

        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            return res.status(400).json({ 
                message: `Não é possível remover pets de um contrato com status "${statusMap[contrato.rows[0].status]}"` 
            });
        }

        const petResult = await client.query(
            'SELECT cp.*, p.nome FROM contrato_pet cp JOIN pet p ON cp.idpet = p.idpet WHERE cp.idcontrato = $1 AND cp.idpet = $2',
            [idContrato, idPet]
        );
        if (petResult.rows.length === 0) return res.status(404).json({ message: 'Pet não encontrado no contrato' });

        const petsCount = await client.query('SELECT COUNT(*) as total FROM contrato_pet WHERE idcontrato = $1', [idContrato]);
        if (parseInt(petsCount.rows[0].total) <= 1) {
            return res.status(400).json({ message: 'Não é possível remover o último pet do contrato' });
        }

        const valorDiaria = parseFloat(contrato.rows[0].valor_diaria || 0);
        const duracaoDias = contrato.rows[0].duracao_dias || 1;
        const valorRemovido = valorDiaria * duracaoDias;

        const deleteResult = await client.query(
            'DELETE FROM contrato_pet WHERE idcontrato = $1 AND idpet = $2 RETURNING *',
            [idContrato, idPet]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Pet removido do contrato com sucesso',
            petExcluido: { ...deleteResult.rows[0], nome: petResult.rows[0].nome },
            impacto_financeiro: {
                valor_removido: valorRemovido,
                valor_total_atualizado: contratoCompleto.calculo_valores.valor_total_contrato
            },
            data: contratoCompleto
        });
    } catch (error) {
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o pet pois está vinculado a outros registros'
            : 'Erro ao excluir pet do contrato';
        res.status(statusCode).json({ message, error: error.message });
    } finally { if (client) client.release(); }
};

// MÉTODOS FALTANTES
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
            result.rows.map(async (contrato) => {
                const contratoComEndereco = {
                    ...contrato,
                    hospedagem_endereco: formatarEndereco(contrato)
                };
                return await buscarContratoComRelacionamentos(client, contrato.idcontrato);
            })
        );

        res.status(200).json(contratosCompletos);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar contratos do usuário', error: error.message });
    } finally {
        if (client) await client.release();
    }
};

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

const calcularValorContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const contratoQuery = `
            SELECT 
                c.idcontrato,
                c.datainicio,
                c.datafim,
                h.idhospedagem,
                h.nome as hospedagem_nome,
                h.valor_diaria,
                COUNT(cp.idpet) as quantidade_pets
            FROM contrato c
            JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN contrato_pet cp ON c.idcontrato = cp.idcontrato
            WHERE c.idcontrato = $1
            GROUP BY c.idcontrato, h.idhospedagem, h.nome, h.valor_diaria
        `;

        const contratoResult = await client.query(contratoQuery, [idContrato]);
        
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contrato = contratoResult.rows[0];

        if (!contrato.valor_diaria || contrato.valor_diaria <= 0) {
            return res.status(400).json({ 
                message: 'Hospedagem não possui valor de diária configurado',
                error: 'VALOR_DIARIA_NAO_CONFIGURADO'
            });
        }

        if (!contrato.datainicio) {
            return res.status(400).json({ 
                message: 'Contrato não possui data de início definida',
                error: 'DATA_INICIO_NAO_DEFINIDA'
            });
        }

        let quantidadeDias = 1;
        
        if (contrato.datafim) {
            const dataInicio = new Date(contrato.datainicio);
            const dataFim = new Date(contrato.datafim);
            
            if (dataFim <= dataInicio) {
                return res.status(400).json({ 
                    message: 'Data fim deve ser posterior à data início',
                    error: 'DATA_FIM_INVALIDA'
                });
            }

            const diffTime = Math.abs(dataFim - dataInicio);
            quantidadeDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            quantidadeDias = Math.max(1, quantidadeDias);
        }

        const valorDiaria = parseFloat(contrato.valor_diaria);
        const quantidadePets = parseInt(contrato.quantidade_pets) || 0;
        const valorTotalHospedagem = valorDiaria * quantidadeDias * quantidadePets;

        const servicosQuery = `
            SELECT 
                cs.idservico,
                cs.quantidade,
                cs.preco_unitario,
                s.descricao,
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1
            ORDER BY s.descricao
        `;

        const servicosResult = await client.query(servicosQuery, [idContrato]);
        const servicos = servicosResult.rows;

        const totalServicos = servicos.reduce((total, servico) => 
            total + parseFloat(servico.subtotal || 0), 0
        );

        const valorTotalContrato = valorTotalHospedagem + totalServicos;

        const resposta = {
            contrato: {
                id: contrato.idcontrato,
                dataInicio: contrato.datainicio,
                dataFim: contrato.datafim,
                quantidadeDias: quantidadeDias,
                quantidadePets: quantidadePets
            },
            hospedagem: {
                id: contrato.idhospedagem,
                nome: contrato.hospedagem_nome,
                valorDiaria: valorDiaria
            },
            calculoHospedagem: {
                valorDiaria: valorDiaria,
                quantidadeDias: quantidadeDias,
                quantidadePets: quantidadePets,
                subtotal: valorTotalHospedagem,
                descricao: `${quantidadePets} pet(s) × ${quantidadeDias} diária(s) × R$ ${valorDiaria.toFixed(2)}`,
                formula: 'valor_diaria × quantidade_dias × quantidade_pets'
            },
            servicos: {
                itens: servicos,
                total: totalServicos,
                quantidade: servicos.length
            },
            totais: {
                subtotalHospedagem: valorTotalHospedagem,
                subtotalServicos: totalServicos,
                valorTotal: valorTotalContrato
            },
            formatado: {
                valorDiaria: `R$ ${valorDiaria.toFixed(2).replace('.', ',')}`,
                subtotalHospedagem: `R$ ${valorTotalHospedagem.toFixed(2).replace('.', ',')}`,
                subtotalServicos: `R$ ${totalServicos.toFixed(2).replace('.', ',')}`,
                valorTotal: `R$ ${valorTotalContrato.toFixed(2).replace('.', ',')}`,
                periodo: `${quantidadeDias} dia(s)`,
                pets: `${quantidadePets} pet(s)`
            }
        };

        res.status(200).json(resposta);

    } catch (error) {
        console.error('Erro ao calcular valor do contrato:', error);
        res.status(500).json({ 
            message: 'Erro ao calcular valor do contrato', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

const lerServicosExistentesContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT idcontrato FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Contrato não encontrado',
                error: 'CONTRATO_NAO_ENCONTRADO'
            });
        }

        // Buscar serviços do contrato com informações detalhadas
        const query = `
            SELECT 
                cs.idcontratoservico,
                cs.idcontrato,
                cs.idservico,
                cs.quantidade,
                cs.preco_unitario,
                cs.data_insercao,
                s.descricao,
                s.preco as preco_atual,
                s.duracao,
                s.ativo,
                s.datacriacao as servico_datacriacao,
                s.dataatualizacao as servico_dataatualizacao,
                (cs.quantidade * cs.preco_unitario) as subtotal,
                CASE 
                    WHEN s.preco != cs.preco_unitario THEN true
                    ELSE false
                END as preco_alterado,
                CASE 
                    WHEN s.preco > cs.preco_unitario THEN 'aumento'
                    WHEN s.preco < cs.preco_unitario THEN 'reducao'
                    ELSE 'igual'
                END as tipo_alteracao_preco,
                ABS(s.preco - cs.preco_unitario) as diferenca_preco,
                ABS(s.preco - cs.preco_unitario) * cs.quantidade as impacto_total_preco
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1
            ORDER BY s.descricao ASC
        `;

        const servicosResult = await client.query(query, [idContrato]);
        
        // Calcular totais
        const totais = servicosResult.rows.reduce((acc, servico) => {
            acc.valorTotal += parseFloat(servico.subtotal || 0);
            acc.quantidadeTotal += servico.quantidade || 0;
            acc.servicosComPrecoAlterado += servico.preco_alterado ? 1 : 0;
            
            if (servico.duracao) {
                acc.totalDuracao += servico.duracao * servico.quantidade;
                acc.servicosComDuracao++;
            }
            
            return acc;
        }, {
            valorTotal: 0,
            quantidadeTotal: 0,
            servicosComPrecoAlterado: 0,
            totalServicos: servicosResult.rows.length,
            totalDuracao: 0,
            servicosComDuracao: 0
        });

        const servicosComDetalhes = servicosResult.rows.map(servico => {
            const precoUnitario = parseFloat(servico.preco_unitario || 0);
            const precoAtual = parseFloat(servico.preco_atual || 0);
            const subtotal = parseFloat(servico.subtotal || 0);
            
            return {
                id: servico.idcontratoservico,
                idContrato: servico.idcontrato,
                idServico: servico.idservico,
                descricao: servico.descricao || 'Não informado',
                quantidade: servico.quantidade || 1,
                precoUnitario: precoUnitario,
                precoAtual: precoAtual,
                duracao: servico.duracao ? parseInt(servico.duracao) : null,
                ativo: servico.ativo,
                subtotal: subtotal,
                dataInsercao: servico.data_insercao,
                servicoDataCriacao: servico.servico_datacriacao,
                servicoDataAtualizacao: servico.servico_dataatualizacao,
                precoAlterado: servico.preco_alterado || false,
                tipoAlteracaoPreco: servico.tipo_alteracao_preco || 'igual',
                diferencaPreco: servico.diferenca_preco ? parseFloat(servico.diferenca_preco) : 0,
                impactoTotalPreco: servico.impacto_total_preco ? parseFloat(servico.impacto_total_preco) : 0,
                // Campos formatados
                precoUnitarioFormatado: `R$ ${precoUnitario.toFixed(2).replace('.', ',')}`,
                precoAtualFormatado: `R$ ${precoAtual.toFixed(2).replace('.', ',')}`,
                subtotalFormatado: `R$ ${subtotal.toFixed(2).replace('.', ',')}`,
                duracaoFormatada: servico.duracao ? `${servico.duracao} minuto(s)` : 'Não definida',
                status: servico.ativo ? 'Ativo' : 'Inativo'
            };
        });

        // Calcular duração média
        let duracaoMedia = null;
        if (totais.servicosComDuracao > 0) {
            duracaoMedia = totais.totalDuracao / totais.servicosComDuracao;
        }

        res.status(200).json({
            message: 'Serviços do contrato listados com sucesso',
            data: {
                idContrato,
                servicos: servicosComDetalhes,
                totais: {
                    ...totais,
                    valorTotalFormatado: `R$ ${totais.valorTotal.toFixed(2).replace('.', ',')}`,
                    duracaoMedia: duracaoMedia ? `${duracaoMedia.toFixed(0)} minuto(s)` : 'Não disponível',
                    valorMedioPorServico: totais.totalServicos > 0 
                        ? `R$ ${(totais.valorTotal / totais.totalServicos).toFixed(2).replace('.', ',')}`
                        : 'R$ 0,00'
                },
                resumo: {
                    servicosAtivos: servicosComDetalhes.filter(s => s.ativo).length,
                    servicosInativos: servicosComDetalhes.filter(s => !s.ativo).length,
                    servicosComPrecoAlterado: totais.servicosComPrecoAlterado,
                    servicosComDuracao: totais.servicosComDuracao,
                    servicosSemDuracao: totais.totalServicos - totais.servicosComDuracao,
                    tiposAlteracaoPreco: {
                        aumento: servicosComDetalhes.filter(s => s.tipoAlteracaoPreco === 'aumento').length,
                        reducao: servicosComDetalhes.filter(s => s.tipoAlteracaoPreco === 'reducao').length,
                        igual: servicosComDetalhes.filter(s => s.tipoAlteracaoPreco === 'igual').length
                    }
                }
            }
        });

    } catch (error) {
        console.error('Erro ao ler serviços do contrato:', error);
        res.status(500).json({ 
            message: 'Erro ao listar serviços do contrato', 
            error: error.message,
            errorCode: error.code 
        });
    } finally {
        if (client) await client.release();
    }
};

const lerPetsExistentesContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT idcontrato FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Contrato não encontrado',
                error: 'CONTRATO_NAO_ENCONTRADO'
            });
        }

        // Buscar pets do contrato com informações detalhadas
        const query = `
            SELECT 
                cp.idcontrato_pet,
                cp.idcontrato,
                cp.idpet,
                p.nome,
                p.sexo,
                p.nascimento,
                u.idusuario,
                u.nome as tutor_nome,
                u.email as tutor_email,
                -- Informações de espécie
                e.idespecie,
                e.descricao as especie_nome,
                -- Informações de raça
                r.idraca,
                r.descricao as raca_nome,
                -- Informações de porte
                po.idporte,
                po.descricao as porte_nome,
                po.descricao as porte_descricao
            FROM contrato_pet cp
            JOIN pet p ON cp.idpet = p.idpet
            JOIN usuario u ON p.idusuario = u.idusuario
            LEFT JOIN especie e ON p.idespecie = e.idespecie
            LEFT JOIN raca r ON p.idraca = r.idraca
            LEFT JOIN porte po ON p.idporte = po.idporte
            WHERE cp.idcontrato = $1
            ORDER BY p.nome ASC
        `;

        const petsResult = await client.query(query, [idContrato]);
        
        // Formatar dados dos pets
        const hoje = new Date();
        const petsComDetalhes = petsResult.rows.map(pet => {
            const dataNascimento = pet.nascimento ? new Date(pet.nascimento) : null;
            let idadeFormatada = 'Não informada';
            let idadeAnos = null;
            let idadeMeses = null;
            
            if (dataNascimento) {
                const diffTime = hoje - dataNascimento;
                idadeAnos = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
                idadeMeses = Math.floor((diffTime % (1000 * 60 * 60 * 24 * 365.25)) / (1000 * 60 * 60 * 24 * 30.44));
                
                if (idadeAnos > 0) {
                    idadeFormatada = `${idadeAnos} ano(s)`;
                    if (idadeMeses > 0) {
                        idadeFormatada += ` e ${idadeMeses} mês(es)`;
                    }
                } else if (idadeMeses > 0) {
                    idadeFormatada = `${idadeMeses} mês(es)`;
                    const diasRestantes = Math.floor((diffTime % (1000 * 60 * 60 * 24 * 30.44)) / (1000 * 60 * 60 * 24));
                    if (diasRestantes > 0) {
                        idadeFormatada += ` e ${diasRestantes} dia(s)`;
                    }
                } else {
                    const dias = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    idadeFormatada = `${dias} dia(s)`;
                }
            }

            return {
                idContratoPet: pet.idcontrato_pet,
                idContrato: pet.idcontrato,
                idPet: pet.idpet,
                nome: pet.nome || 'Não informado',
                sexo: pet.sexo ? (pet.sexo === 'M' ? 'Macho' : 'Fêmea') : 'Não informado',
                nascimento: pet.nascimento,
                nascimentoFormatado: pet.nascimento 
                    ? new Date(pet.nascimento).toLocaleDateString('pt-BR')
                    : 'Não informado',
                idade: {
                    anos: idadeAnos,
                    meses: idadeMeses,
                    formatada: idadeFormatada
                },
                especie: {
                    id: pet.idespecie,
                    nome: pet.especie_nome || 'Não informada'
                },
                raca: {
                    id: pet.idraca,
                    nome: pet.raca_nome || 'Não informada'
                },
                porte: {
                    id: pet.idporte,
                    nome: pet.porte_nome || 'Não informado',
                    descricao: pet.porte_descricao || ''
                },
                tutor: {
                    id: pet.idusuario,
                    nome: pet.tutor_nome || 'Não informado',
                    email: pet.tutor_email || 'Não informado'
                },
                dataInsercao: pet.data_insercao
            };
        });

        // Estatísticas
        const estatisticas = petsComDetalhes.reduce((acc, pet) => {
            // Contagem por espécie
            if (pet.especie.nome) {
                acc.especies[pet.especie.nome] = (acc.especies[pet.especie.nome] || 0) + 1;
            } else {
                acc.especies['Não informada'] = (acc.especies['Não informada'] || 0) + 1;
            }
            
            // Contagem por sexo
            if (pet.sexo === 'Macho') {
                acc.sexos.macho++;
            } else if (pet.sexo === 'Fêmea') {
                acc.sexos.femea++;
            } else {
                acc.sexos.naoInformado++;
            }
            
            // Contagem por porte
            if (pet.porte.nome) {
                acc.portes[pet.porte.nome] = (acc.portes[pet.porte.nome] || 0) + 1;
            } else {
                acc.portes['Não informado'] = (acc.portes['Não informado'] || 0) + 1;
            }
            
            // Contagem por raça
            if (pet.raca.nome) {
                acc.racas[pet.raca.nome] = (acc.racas[pet.raca.nome] || 0) + 1;
            } else {
                acc.racas['Não informada'] = (acc.racas['Não informada'] || 0) + 1;
            }
            
            // Idade média
            if (pet.idade.anos !== null) {
                acc.totalIdadeAnos += parseInt(pet.idade.anos || 0);
                acc.totalIdadeMeses += parseInt(pet.idade.meses || 0);
                acc.petsComIdade++;
            }
            
            return acc;
        }, {
            total: petsComDetalhes.length,
            especies: {},
            sexos: { macho: 0, femea: 0, naoInformado: 0 },
            portes: {},
            racas: {},
            totalIdadeAnos: 0,
            totalIdadeMeses: 0,
            petsComIdade: 0
        });

        // Calcular idade média
        let idadeMediaFormatada = 'Não disponível';
        if (estatisticas.petsComIdade > 0) {
            const mediaAnos = estatisticas.totalIdadeAnos / estatisticas.petsComIdade;
            const mediaMeses = estatisticas.totalIdadeMeses / estatisticas.petsComIdade;
            
            idadeMediaFormatada = '';
            if (mediaAnos >= 1) {
                idadeMediaFormatada += `${mediaAnos.toFixed(1)} ano(s)`;
                if (mediaMeses >= 1) {
                    idadeMediaFormatada += ` e ${Math.round(mediaMeses)} mês(es)`;
                }
            } else if (mediaMeses >= 1) {
                idadeMediaFormatada += `${Math.round(mediaMeses)} mês(es)`;
            } else {
                idadeMediaFormatada = 'Menos de 1 mês';
            }
        }

        // Converter objetos em arrays para facilitar o consumo
        const especiesArray = Object.entries(estatisticas.especies).map(([nome, quantidade]) => ({
            nome,
            quantidade,
            porcentagem: ((quantidade / estatisticas.total) * 100).toFixed(1) + '%'
        }));

        const portesArray = Object.entries(estatisticas.portes).map(([nome, quantidade]) => ({
            nome,
            quantidade,
            porcentagem: ((quantidade / estatisticas.total) * 100).toFixed(1) + '%'
        }));

        const racasArray = Object.entries(estatisticas.racas).map(([nome, quantidade]) => ({
            nome,
            quantidade,
            porcentagem: ((quantidade / estatisticas.total) * 100).toFixed(1) + '%'
        }));

        res.status(200).json({
            message: 'Pets do contrato listados com sucesso',
            data: {
                idContrato,
                pets: petsComDetalhes,
                estatisticas: {
                    total: estatisticas.total,
                    especies: especiesArray,
                    sexos: estatisticas.sexos,
                    portes: portesArray,
                    racas: racasArray,
                    idadeMedia: idadeMediaFormatada,
                    distribuicaoIdade: {
                        filhotes: petsComDetalhes.filter(p => p.idade.anos !== null && p.idade.anos < 1).length,
                        adultos: petsComDetalhes.filter(p => p.idade.anos !== null && p.idade.anos >= 1 && p.idade.anos < 7).length,
                        idosos: petsComDetalhes.filter(p => p.idade.anos !== null && p.idade.anos >= 7).length,
                        idadeNaoInformada: petsComDetalhes.filter(p => p.idade.anos === null).length
                    }
                },
                resumo: {
                    tutor: petsComDetalhes.length > 0 ? petsComDetalhes[0].tutor : null,
                    especiesUnicas: especiesArray.length,
                    racasUnicas: racasArray.length,
                    portesUnicos: portesArray.length
                }
            }
        });

    } catch (error) {
        console.error('Erro ao ler pets do contrato:', error);
        res.status(500).json({ 
            message: 'Erro ao listar pets do contrato', 
            error: error.message,
            errorCode: error.code 
        });
    } finally {
        if (client) await client.release();
    }
};

// Exportação
module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    excluirContrato,
    buscarContratosPorUsuario,
    buscarContratosPorUsuarioEStatus,
    adicionarServicoContrato,
    adicionarPetContrato,
    excluirServicoContrato,
    excluirPetContrato,
    atualizarDatasContrato,
    atualizarStatusContrato,
    alterarStatusContrato,
    obterTransicoesStatus,
    calcularValorContrato,
    buscarContratoComRelacionamentos,
    lerServicosExistentesContrato,
    lerPetsExistentesContrato
};