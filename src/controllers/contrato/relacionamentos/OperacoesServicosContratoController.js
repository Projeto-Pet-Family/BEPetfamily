const pool = require('../../../connections/SQLConnections.js');
/* const { buscarContratoComRelacionamentos, statusNaoEditaveis, statusMap } = require('../ContratoController'); */
const { 
    buscarContratoComRelacionamentos, 
    validarStatus, 
    validarDatas, 
    construirQueryUpdate, 
    statusNaoEditaveis, 
    statusMap 
} = require('../ContratoUtils.js');

const adicionarServicoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const { idContrato } = req.params;
        const { servicosPorPet } = req.body;

        if (!servicosPorPet || !Array.isArray(servicosPorPet) || servicosPorPet.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Lista de serviços por pet é obrigatória' });
        }

        const formatoValido = servicosPorPet.every(item => 
            item.idPet && 
            item.servicos && 
            Array.isArray(item.servicos) && 
            item.servicos.length > 0
        );

        if (!formatoValido) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: 'Formato inválido. Use: [{idPet: 1, servicos: [1, 2, 3]}, ...]' 
            });
        }

        const petsIds = servicosPorPet.map(item => item.idPet);
        const petsUnicos = [...new Set(petsIds)];
        if (petsUnicos.length !== servicosPorPet.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: 'Não é permitido adicionar serviços para o mesmo pet múltiplas vezes na mesma requisição' 
            });
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

        const contratoPets = await client.query(
            'SELECT idpet FROM contrato_pet WHERE idcontrato = $1 AND idpet = ANY($2)',
            [idContrato, petsIds]
        );

        if (contratoPets.rows.length !== petsIds.length) {
            await client.query('ROLLBACK');
            const petsValidosIds = contratoPets.rows.map(p => p.idpet);
            const petsInvalidos = petsIds.filter(id => !petsValidosIds.includes(id));
            
            return res.status(400).json({ 
                message: 'Um ou mais pets não pertencem a este contrato',
                petsInvalidos: petsInvalidos
            });
        }

        const todosServicosIds = servicosPorPet.flatMap(item => item.servicos);
        
        for (const item of servicosPorPet) {
            const servicosUnicos = [...new Set(item.servicos)];
            if (servicosUnicos.length !== item.servicos.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    message: `Não é permitido adicionar o mesmo serviço múltiplas vezes para o pet ${item.idPet}` 
                });
            }
        }

        for (const item of servicosPorPet) {
            const servicosExistentes = await client.query(
                `SELECT cs.idservico 
                 FROM contratoservico cs 
                 WHERE cs.idcontrato = $1 
                 AND cs.idservico = ANY($2) 
                 AND cs.idpet = $3`,
                [idContrato, item.servicos, item.idPet]
            );

            if (servicosExistentes.rows.length > 0) {
                await client.query('ROLLBACK');
                const servicosExistentesIds = servicosExistentes.rows.map(s => s.idservico);
                return res.status(400).json({ 
                    message: `Um ou mais serviços já estão vinculados a este contrato para o pet ${item.idPet}`,
                    pet: item.idPet,
                    servicosExistentes: servicosExistentesIds
                });
            }
        }

        const servicosValidos = await client.query(
            'SELECT idservico, preco FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true',
            [todosServicosIds, contrato.rows[0].idhospedagem]
        );

        if (servicosValidos.rows.length !== todosServicosIds.length) {
            await client.query('ROLLBACK');
            const servicosValidosIds = servicosValidos.rows.map(s => s.idservico);
            const servicosInvalidos = todosServicosIds.filter(id => !servicosValidosIds.includes(id));
            
            return res.status(400).json({ 
                message: 'Um ou mais serviços não estão disponíveis para esta hospedagem',
                servicosInvalidos: servicosInvalidos
            });
        }

        const servicosInseridos = [];
        
        for (const item of servicosPorPet) {
            const { idPet, servicos: servicosIds } = item;
            
            for (const idServico of servicosIds) {
                const servicoInfo = servicosValidos.rows.find(s => s.idservico === idServico);
                const precoUnitario = servicoInfo.preco;
                const quantidade = 1;
                
                const result = await client.query(
                    `INSERT INTO contratoservico 
                     (idcontrato, idservico, idpet, quantidade, preco_unitario) 
                     VALUES ($1, $2, $3, $4, $5) 
                     RETURNING *`,
                    [idContrato, idServico, idPet, quantidade, precoUnitario]
                );
                servicosInseridos.push(result.rows[0]);
            }
        }

        await client.query('COMMIT');
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        
        const valorServicosAdicional = servicosInseridos.reduce((sum, s) => sum + (s.preco_unitario * s.quantidade), 0);
        
        const servicosPorPetAgrupados = {};
        servicosInseridos.forEach(servico => {
            if (!servicosPorPetAgrupados[servico.idpet]) {
                servicosPorPetAgrupados[servico.idpet] = [];
            }
            servicosPorPetAgrupados[servico.idpet].push(servico);
        });
        
        res.status(200).json({
            message: 'Serviço(s) adicionado(s) com sucesso',
            servicosAdicionados: servicosPorPetAgrupados,
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
    } finally { 
        if (client) client.release(); 
    }
};

const excluirServicoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idServico, idPet } = req.params;

        const servicoQuery = `
            SELECT cs.*, s.descricao, p.nome as pet_nome 
            FROM contratoservico cs 
            JOIN servico s ON cs.idservico = s.idservico
            LEFT JOIN pet p ON cs.idpet = p.idpet
            WHERE cs.idcontrato = $1 
            AND cs.idservico = $2 
            AND cs.idpet = $3
        `;

        const servicoResult = await client.query(servicoQuery, [idContrato, idServico, idPet]);
        
        if (servicoResult.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Serviço não encontrado para este pet no contrato',
                detalhes: 'Verifique se o serviço está vinculado ao pet especificado'
            });
        }

        const contrato = await client.query('SELECT status FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contrato.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            return res.status(400).json({ 
                message: `Não é possível remover serviços de um contrato com status "${statusMap[contrato.rows[0].status]}"`
            });
        }

        const valorRemovido = servicoResult.rows[0].quantidade * servicoResult.rows[0].preco_unitario;

        const deleteResult = await client.query(
            'DELETE FROM contratoservico WHERE idcontrato = $1 AND idservico = $2 AND idpet = $3 RETURNING *',
            [idContrato, idServico, idPet]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Serviço removido do contrato com sucesso',
            servicoExcluido: { 
                ...deleteResult.rows[0], 
                descricao: servicoResult.rows[0].descricao,
                pet_nome: servicoResult.rows[0].pet_nome
            },
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

const lerServicosExistentesContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const contratoResult = await client.query(
            `SELECT c.idcontrato, h.idhospedagem, h.nome as hospedagem_nome
             FROM contrato c
             JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
             WHERE c.idcontrato = $1`,
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Contrato não encontrado',
                error: 'CONTRATO_NAO_ENCONTRADO'
            });
        }

        const contrato = contratoResult.rows[0];
        const idHospedagem = contrato.idhospedagem;

        const petsQuery = `
            SELECT p.idpet, p.nome as pet_nome
            FROM contrato_pet cp
            JOIN pet p ON cp.idpet = p.idpet
            WHERE cp.idcontrato = $1
            ORDER BY p.nome
        `;
        const petsResult = await client.query(petsQuery, [idContrato]);
        const pets = petsResult.rows;

        const servicosQuery = `
            SELECT 
                s.idservico,
                s.descricao,
                s.preco as preco_atual,
                s.ativo
            FROM servico s
            WHERE s.idhospedagem = $1
            ORDER BY s.descricao ASC
        `;

        const servicosResult = await client.query(servicosQuery, [idHospedagem]);
        
        const servicosPorPet = {};
        
        for (const pet of pets) {
            const servicosDoPet = await client.query(
                `SELECT cs.idservico 
                 FROM contratoservico cs 
                 WHERE cs.idcontrato = $1 AND cs.idpet = $2`,
                [idContrato, pet.idpet]
            );
            
            const servicosDoPetIds = servicosDoPet.rows.map(s => s.idservico);
            
            servicosPorPet[pet.idpet] = {
                idPet: pet.idpet,
                nome: pet.pet_nome,
                servicos: servicosResult.rows.map(servico => ({
                    idServico: servico.idservico,
                    descricao: servico.descricao,
                    precoAtual: parseFloat(servico.preco_atual || 0),
                    ativo: servico.ativo,
                    jaAdicionado: servicosDoPetIds.includes(servico.idservico)
                }))
            };
        }

        res.status(200).json({
            message: 'Serviços da hospedagem listados por pet',
            data: {
                contrato: {
                    id: contrato.idcontrato
                },
                hospedagem: {
                    id: contrato.idhospedagem,
                    nome: contrato.hospedagem_nome || 'Não informado'
                },
                servicosPorPet: servicosPorPet
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

const listarServicosDoPetNoContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idPet } = req.params;

        const petContrato = await client.query(
            `SELECT cp.*, p.nome as pet_nome 
             FROM contrato_pet cp 
             JOIN pet p ON cp.idpet = p.idpet 
             WHERE cp.idcontrato = $1 AND cp.idpet = $2`,
            [idContrato, idPet]
        );

        if (petContrato.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Pet não encontrado neste contrato',
                error: 'PET_NAO_ENCONTRADO'
            });
        }

        const servicosQuery = `
            SELECT 
                cs.*,
                s.descricao,
                s.preco as preco_atual,
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1 AND cs.idpet = $2
            ORDER BY s.descricao
        `;

        const servicosResult = await client.query(servicosQuery, [idContrato, idPet]);
        
        const totalServicosPet = servicosResult.rows.reduce((total, servico) => 
            total + (parseFloat(servico.subtotal) || 0), 0
        );

        res.status(200).json({
            message: 'Serviços do pet no contrato listados com sucesso',
            data: {
                pet: {
                    idPet: idPet,
                    nome: petContrato.rows[0].pet_nome
                },
                contrato: {
                    id: idContrato
                },
                servicos: servicosResult.rows.map(servico => ({
                    idServico: servico.idservico,
                    descricao: servico.descricao,
                    quantidade: servico.quantidade,
                    precoUnitario: servico.preco_unitario,
                    precoAtual: servico.preco_atual,
                    subtotal: servico.subtotal
                })),
                resumo: {
                    quantidadeServicos: servicosResult.rows.length,
                    valorTotalServicos: totalServicosPet
                }
            }
        });

    } catch (error) {
        console.error('Erro ao listar serviços do pet:', error);
        res.status(500).json({ 
            message: 'Erro ao listar serviços do pet no contrato', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

const atualizarQuantidadeServicoPet = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idServico, idPet } = req.params;
        const { quantidade } = req.body;

        if (!quantidade || quantidade < 1) {
            return res.status(400).json({ 
                message: 'Quantidade é obrigatória e deve ser maior que zero' 
            });
        }

        const servicoExistente = await client.query(
            `SELECT cs.* FROM contratoservico cs 
             WHERE cs.idcontrato = $1 AND cs.idservico = $2 AND cs.idpet = $3`,
            [idContrato, idServico, idPet]
        );

        if (servicoExistente.rows.length === 0) {
            return res.status(404).json({ 
                message: 'Serviço não encontrado para este pet no contrato' 
            });
        }

        const contrato = await client.query('SELECT status FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (statusNaoEditaveis.includes(contrato.rows[0].status)) {
            return res.status(400).json({ 
                message: `Não é possível atualizar serviços de um contrato com status "${statusMap[contrato.rows[0].status]}"`
            });
        }

        const updateResult = await client.query(
            `UPDATE contratoservico 
             SET quantidade = $1, dataatualizacao = CURRENT_TIMESTAMP 
             WHERE idcontrato = $2 AND idservico = $3 AND idpet = $4 
             RETURNING *`,
            [quantidade, idContrato, idServico, idPet]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Quantidade do serviço atualizada com sucesso',
            servicoAtualizado: updateResult.rows[0],
            data: contratoCompleto,
            impacto: {
                quantidadeAnterior: servicoExistente.rows[0].quantidade,
                quantidadeNova: quantidade,
                diferencaValor: (quantidade - servicoExistente.rows[0].quantidade) * servicoExistente.rows[0].preco_unitario
            }
        });

    } catch (error) {
        console.error('Erro ao atualizar quantidade do serviço:', error);
        res.status(500).json({ 
            message: 'Erro ao atualizar quantidade do serviço', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
};

module.exports = {
    adicionarServicoContrato,
    excluirServicoContrato,
    lerServicosExistentesContrato,
    listarServicosDoPetNoContrato,
    atualizarQuantidadeServicoPet
};