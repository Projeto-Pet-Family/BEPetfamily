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

async function buscarContratoComRelacionamentos(idContrato) {
    let client;
    
    try {
        if (!idContrato) {
            console.log('⚠️ ID do contrato não fornecido');
            return null;
        }
        
        client = await pool.connect();
        
        console.log(`🔍 Buscando contrato ID ${idContrato}...`);
        
        // 1. Buscar informações básicas do contrato
        const contratoQuery = await client.query(
            `SELECT c.*, 
                    h.nome as hospedagem_nome,
                    h.valor_diaria,
                    u.nome as usuario_nome
             FROM contrato c
             JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
             JOIN usuario u ON c.idusuario = u.idusuario
             WHERE c.idcontrato = $1`,
            [idContrato]
        );
        
        if (contratoQuery.rows.length === 0) {
            console.log('❌ Contrato não encontrado');
            return null;
        }
        
        const contrato = contratoQuery.rows[0];
        console.log('✅ Contrato base encontrado');
        
        // 2. Buscar pets do contrato
        const petsQuery = await client.query(
            `SELECT p.* 
             FROM contrato_pet cp
             JOIN pet p ON cp.idpet = p.idpet
             WHERE cp.idcontrato = $1`,
            [idContrato]
        );
        
        contrato.pets = petsQuery.rows;
        console.log(`✅ ${petsQuery.rows.length} pets encontrados`);
        
        // 3. Buscar serviços do contrato
        const servicosQuery = await client.query(
            `SELECT cs.*, 
                    s.descricao as servico_descricao,
                    s.preco as servico_preco_original
             FROM contratoservico cs
             JOIN servico s ON cs.idservico = s.idservico
             WHERE cs.idcontrato = $1`,
            [idContrato]
        );
        
        contrato.servicos = servicosQuery.rows;
        console.log(`✅ ${servicosQuery.rows.length} serviços encontrados`);
        
        return contrato;
        
    } catch (error) {
        console.error('❌ Erro ao buscar contrato completo:', error.message);
        return null;
    } finally {
        if (client) {
            client.release();
        }
    }
}

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