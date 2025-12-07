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

        const servicosDoPet = await client.query(
            'SELECT COUNT(*) as total FROM contratoservico WHERE idcontrato = $1 AND idpet = $2',
            [idContrato, idPet]
        );

        const petsCount = await client.query('SELECT COUNT(*) as total FROM contrato_pet WHERE idcontrato = $1', [idContrato]);
        if (parseInt(petsCount.rows[0].total) <= 1) {
            return res.status(400).json({ message: 'Não é possível remover o último pet do contrato' });
        }

        const valorDiaria = parseFloat(contrato.rows[0].valor_diaria || 0);
        const duracaoDias = contrato.rows[0].duracao_dias || 1;
        const valorRemovidoHospedagem = valorDiaria * duracaoDias;

        await client.query('BEGIN');

        if (parseInt(servicosDoPet.rows[0].total) > 0) {
            await client.query('DELETE FROM contratoservico WHERE idcontrato = $1 AND idpet = $2', [idContrato, idPet]);
        }

        const deleteResult = await client.query(
            'DELETE FROM contrato_pet WHERE idcontrato = $1 AND idpet = $2 RETURNING *',
            [idContrato, idPet]
        );

        await client.query('COMMIT');

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Pet removido do contrato com sucesso',
            petExcluido: { 
                ...deleteResult.rows[0], 
                nome: petResult.rows[0].nome,
                servicosRemovidos: parseInt(servicosDoPet.rows[0].total)
            },
            impacto_financeiro: {
                valor_removido_hospedagem: valorRemovidoHospedagem,
                valor_total_atualizado: contratoCompleto.calculo_valores.valor_total_contrato
            },
            data: contratoCompleto
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o pet pois está vinculado a outros registros'
            : 'Erro ao excluir pet do contrato';
        res.status(statusCode).json({ message, error: error.message });
    } finally { if (client) client.release(); }
};

const lerPetsExistentesContrato = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const contratoResult = await client.query(
            `SELECT 
                c.idcontrato,
                u.idusuario,
                u.nome as tutor_nome,
                u.email,
                h.idhospedagem,
                h.nome as hospedagem_nome,
                h.telefone as hospedagem_telefone
             FROM contrato c
             JOIN usuario u ON c.idusuario = u.idusuario
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
        const idUsuarioContrato = contrato.idusuario;

        const query = `
            SELECT 
                p.idpet,
                p.nome as pet_nome,
                p.sexo,
                EXISTS (
                    SELECT 1 FROM contrato_pet cp 
                    WHERE cp.idpet = p.idpet 
                    AND cp.idcontrato = $1
                ) as esta_no_contrato,
                (
                    SELECT COUNT(*) 
                    FROM contratoservico cs 
                    WHERE cs.idpet = p.idpet 
                    AND cs.idcontrato = $1
                ) as quantidade_servicos
            FROM pet p
            WHERE p.idusuario = $2
            ORDER BY esta_no_contrato DESC, p.nome ASC
        `;

        const petsResult = await client.query(query, [idContrato, idUsuarioContrato]);
        
        const petsSimples = petsResult.rows.map(pet => ({
            idPet: pet.idpet,
            nome: pet.pet_nome || 'Não informado',
            sexo: pet.sexo ? (pet.sexo === 'M' ? 'Macho' : 'Fêmea') : 'Não informado',
            estaNoContrato: pet.esta_no_contrato,
            quantidadeServicos: parseInt(pet.quantidade_servicos) || 0
        }));

        res.status(200).json({
            message: 'Pets do usuário listados com sucesso',
            data: {
                contrato: {
                    id: contrato.idcontrato,
                },
                hospedagem: {
                    id: contrato.idhospedagem,
                    nome: contrato.hospedagem_nome || 'Não informado',
                },
                usuario: {
                    id: contrato.idusuario,
                    nome: contrato.tutor_nome || 'Não informado',
                    email: contrato.email || 'Não informado'
                },
                pets: petsSimples,
                resumo: {
                    totalPets: petsSimples.length,
                    petsNoContrato: petsSimples.filter(p => p.estaNoContrato).length,
                    petsComServicos: petsSimples.filter(p => p.quantidadeServicos > 0).length
                }
            }
        });

    } catch (error) {
        console.error('Erro ao listar pets do usuário:', error);
        res.status(500).json({ 
            message: 'Erro ao listar pets do usuário', 
            error: error.message,
            errorCode: error.code 
        });
    } finally {
        if (client) await client.release();
    }
};

module.exports = {
    adicionarPetContrato,
    excluirPetContrato,
    lerPetsExistentesContrato
};