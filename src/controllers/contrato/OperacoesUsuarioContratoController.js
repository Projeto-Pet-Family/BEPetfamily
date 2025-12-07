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
            result.rows.map(contrato => buscarContratoComRelacionamentos(client, contrato.idcontrato))
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
            ),
            servicos_total: contratosCompletos.reduce((total, contrato) => {
                if (contrato.calculo_valores?.servicos_por_pet) {
                    return total + Object.values(contrato.calculo_valores.servicos_por_pet).reduce((sum, pet) => 
                        sum + pet.quantidadeServicos, 0);
                }
                return total;
            }, 0)
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