// controllers/contrato/ContratoUtils.js
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

const calcularValoresContratoPorPet = (contrato, pets = []) => {
    const valorDiaria = parseFloat(contrato.valor_diaria || 0);
    const quantidadeDias = contrato.duracao_dias || 1;
    const quantidadePets = pets.length;
    
    const valorTotalHospedagem = valorDiaria * quantidadeDias * quantidadePets;
    
    const servicosPorPet = {};
    let totalServicos = 0;
    
    pets.forEach(pet => {
        const servicosPet = pet.servicos || [];
        const totalPet = servicosPet.reduce((total, s) => total + (parseFloat(s.subtotal) || 0), 0);
        servicosPorPet[pet.idpet] = {
            idPet: pet.idpet,
            nome: pet.nome,
            total: totalPet,
            quantidadeServicos: servicosPet.length,
            servicos: servicosPet.map(s => ({
                idservico: s.idservico,
                descricao: s.descricao,
                quantidade: s.quantidade,
                preco_unitario: s.preco_unitario,
                subtotal: s.subtotal
            }))
        };
        totalServicos += totalPet;
    });
    
    const valorTotalContrato = valorTotalHospedagem + totalServicos;
    
    const formatar = (valor) => `R$ ${valor.toFixed(2).replace('.', ',')}`;
    
    return {
        valor_diaria: valorDiaria,
        quantidade_dias: quantidadeDias,
        quantidade_pets: quantidadePets,
        valor_total_hospedagem: valorTotalHospedagem,
        valor_total_servicos: totalServicos,
        valor_total_contrato: valorTotalContrato,
        servicos_por_pet: servicosPorPet,
        formatado: {
            valorDiaria: formatar(valorDiaria),
            valorTotalHospedagem: formatar(valorTotalHospedagem),
            valorTotalServicos: formatar(totalServicos),
            valorTotalContrato: formatar(valorTotalContrato),
            periodo: `${quantidadeDias} dia(s)`,
            pets: `${quantidadePets} pet(s)`
        }
    };
};

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

        const petsResult = await client.query(
            `SELECT p.* FROM contrato_pet cp 
             JOIN pet p ON cp.idpet = p.idpet 
             WHERE cp.idcontrato = $1`, 
            [idContrato]
        );

        const servicosResult = await client.query(
            `SELECT cs.*, s.descricao, s.preco as preco_atual, 
                    p.nome as pet_nome, p.idpet,
                    (cs.quantidade * cs.preco_unitario) as subtotal
             FROM contratoservico cs 
             JOIN servico s ON cs.idservico = s.idservico
             LEFT JOIN pet p ON cs.idpet = p.idpet
             WHERE cs.idcontrato = $1 
             ORDER BY p.nome, s.descricao`, 
            [idContrato]
        );

        const servicosPorPet = {};
        servicosResult.rows.forEach(servico => {
            const idPet = servico.idpet;
            if (!servicosPorPet[idPet]) {
                servicosPorPet[idPet] = [];
            }
            servicosPorPet[idPet].push(servico);
        });

        contrato.pets = petsResult.rows.map(pet => ({
            ...pet,
            servicos: servicosPorPet[pet.idpet] || []
        }));

        if (contrato.datainicio && contrato.datafim) {
            const diffTime = Math.abs(new Date(contrato.datafim) - new Date(contrato.datainicio));
            contrato.duracao_dias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
            contrato.duracao_dias = null;
        }

        contrato.calculo_valores = calcularValoresContratoPorPet(contrato, contrato.pets);
        contrato.status_descricao = statusMap[contrato.status] || 'Desconhecido';

        return contrato;
    } catch (error) {
        console.error('Erro ao buscar contrato com relacionamentos:', error);
        throw error;
    }
};

module.exports = {
    statusValidos,
    statusMap,
    statusNaoEditaveis,
    formatarEndereco,
    validarStatus,
    validarDatas,
    construirQueryUpdate,
    calcularValoresContratoPorPet,
    buscarContratoComRelacionamentos
};