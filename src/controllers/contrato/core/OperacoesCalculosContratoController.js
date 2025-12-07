const pool = require('../../../connections/SQLConnections.js');

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
                h.valor_diaria
            FROM contrato c
            JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            WHERE c.idcontrato = $1
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

        const petsQuery = `
            SELECT COUNT(*) as quantidade_pets
            FROM contrato_pet 
            WHERE idcontrato = $1
        `;
        const petsResult = await client.query(petsQuery, [idContrato]);
        const quantidadePets = parseInt(petsResult.rows[0].quantidade_pets) || 0;

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
        const valorTotalHospedagem = valorDiaria * quantidadeDias * quantidadePets;

        const servicosQuery = `
            SELECT 
                cs.idpet,
                p.nome as pet_nome,
                cs.idservico,
                cs.quantidade,
                cs.preco_unitario,
                s.descricao,
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            LEFT JOIN pet p ON cs.idpet = p.idpet
            WHERE cs.idcontrato = $1
            ORDER BY p.nome, s.descricao
        `;

        const servicosResult = await client.query(servicosQuery, [idContrato]);
        const servicos = servicosResult.rows;

        const servicosPorPet = {};
        servicos.forEach(servico => {
            const idPet = servico.idpet;
            if (!servicosPorPet[idPet]) {
                servicosPorPet[idPet] = {
                    idPet: idPet,
                    nome: servico.pet_nome || 'Pet sem nome',
                    servicos: [],
                    total: 0
                };
            }
            servicosPorPet[idPet].servicos.push(servico);
            servicosPorPet[idPet].total += parseFloat(servico.subtotal || 0);
        });

        const totalServicos = Object.values(servicosPorPet).reduce((total, pet) => total + pet.total, 0);
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
                porPet: servicosPorPet,
                total: totalServicos,
                quantidadeItens: servicos.length
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

module.exports = {
    calcularValorContrato
};