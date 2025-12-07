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

        const { 
            idHospedagem, 
            idUsuario, 
            status = 'em_aprovacao', 
            dataInicio, 
            dataFim, 
            pets = [], 
            servicosPorPet = []
        } = req.body;

        if (!idHospedagem || !idUsuario || !dataInicio) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'idHospedagem, idUsuario e dataInicio são obrigatórios' });
        }
        if (!validarStatus(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status inválido' });
        }
        validarDatas(dataInicio, dataFim);

        const [hospedagem, usuario] = await Promise.all([
            client.query('SELECT idhospedagem, valor_diaria FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]),
            client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]),
        ]);

        if (hospedagem.rows.length === 0) throw new Error('Hospedagem não encontrada');
        if (usuario.rows.length === 0) throw new Error('Usuário não encontrado');

        if (pets.length > 0) {
            const petsValidos = await client.query(
                'SELECT idpet FROM pet WHERE idpet = ANY($1) AND idusuario = $2',
                [pets, idUsuario]
            );
            if (petsValidos.rows.length !== pets.length) {
                throw new Error('Um ou mais pets não pertencem ao usuário');
            }
        }

        const servicosPorPetValidos = [];
        if (servicosPorPet.length > 0) {
            const todosServicosIds = servicosPorPet.flatMap(item => item.servicos || []);
            
            if (todosServicosIds.length > 0) {
                const servicosValidos = await client.query(
                    'SELECT idservico, preco FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true',
                    [todosServicosIds, idHospedagem]
                );
                
                if (servicosValidos.rows.length !== todosServicosIds.length) {
                    throw new Error('Um ou mais serviços não estão disponíveis para esta hospedagem');
                }

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

        const contratoIdentico = await client.query(
            `SELECT idcontrato FROM contrato WHERE idhospedagem = $1 AND idusuario = $2 AND datainicio = $3 
             AND COALESCE(datafim, $4) = COALESCE($4, datafim) AND status IN ('em_aprovacao', 'aprovado', 'em_execucao') LIMIT 1`,
            [idHospedagem, idUsuario, dataInicio, dataFim]
        );

        if (contratoIdentico.rows.length > 0) {
            throw new Error('Já existe um contrato idêntico ativo');
        }

        const contratoResult = await client.query(
            'INSERT INTO contrato (idhospedagem, idusuario, status, datainicio, datafim) VALUES ($1, $2, $3, $4, $5) RETURNING idcontrato',
            [idHospedagem, idUsuario, status, dataInicio, dataFim]
        );
        const idContrato = contratoResult.rows[0].idcontrato;

        if (pets.length > 0) {
            const petsValues = pets.map(idPet => `(${idContrato}, ${idPet})`).join(',');
            await client.query(`INSERT INTO contrato_pet (idcontrato, idpet) VALUES ${petsValues}`);
        }

        if (servicosPorPetValidos.length > 0) {
            const servicosValues = servicosPorPetValidos.map(servico => 
                `(${idContrato}, ${servico.idServico}, ${servico.idPet}, 1, ${servico.precoUnitario})`
            ).join(',');
            
            await client.query(
                `INSERT INTO contratoservico (idcontrato, idservico, idpet, quantidade, preco_unitario) VALUES ${servicosValues}`
            );
        }

        await client.query('COMMIT');
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        
        res.status(201).json({ 
            message: 'Contrato criado com sucesso',
            data: contratoCompleto,
            resumo: {
                petsAdicionados: pets.length,
                servicosAdicionados: servicosPorPetValidos.length,
                servicosPorPet: servicosPorPet
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        const statusCode = error.message.includes('timeout') ? 408 : 500;
        res.status(statusCode).json({ 
            message: 'Erro ao criar contrato', 
            error: error.message,
            detalhes: error.detail 
        });
    } finally { 
        if (client) client.release(); 
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