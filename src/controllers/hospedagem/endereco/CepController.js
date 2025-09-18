const pool = require('../../../connections/SQLConnections.js');

async function lerCEPs(req, res) {
    let client;

    try {
        client = await pool.connect();

        // Adiciona filtro por logradouro se fornecido
        const { logradouroId } = req.query;
        let query = `
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM cep c
            JOIN logradouro l ON c.idlogradouro = l.idlogradouro
            JOIN bairro b ON l.idbairro = b.idbairro
            JOIN cidade ci ON b.idcidade = ci.idcidade
            JOIN estado e ON ci.idestado = e.idestado
        `;
        const params = [];

        if (logradouroId) {
            query += ' WHERE c.id_logradouro = $1';
            params.push(logradouroId);
        }

        query += ' ORDER BY c.codigo';

        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar CEPs',
            error: error.message
        });
        console.error('Erro ao listar CEPs:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarCEPPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idCEP } = req.params;

        const result = await client.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM cep c
            JOIN logradouro l ON c.id_logradouro = l.id_logradouro
            JOIN bairro b ON l.id_bairro = b.id_bairro
            JOIN cidade ci ON b.id_cidade = ci.id_cidade
            JOIN estado e ON ci.id_estado = e.id_estado
            WHERE c.id_cep = $1
        `, [idCEP]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'CEP não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar CEP',
            error: error.message
        });
        console.error('Erro ao buscar CEP:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarCEP(req, res) {
    let client;

    try {
        client = await pool.connect();

        const {
            codigo,
            idLogradouro
        } = req.body;

        // Validar campos obrigatórios
        if (!codigo || !idLogradouro) {
            return res.status(400).json({
                message: 'Código e ID do logradouro são campos obrigatórios'
            });
        }

        // Validar formato do CEP (XXXXX-XXX)
        const cepRegex = /^\d{5}-\d{3}$/;
        if (!cepRegex.test(codigo)) {
            return res.status(400).json({
                message: 'Formato do CEP inválido. Use o formato XXXXX-XXX'
            });
        }

        // Verificar se o logradouro existe
        const logradouro = await client.query('SELECT 1 FROM logradouro WHERE id_logradouro = $1', [idLogradouro]);
        if (logradouro.rows.length === 0) {
            return res.status(400).json({
                message: 'Logradouro não encontrado'
            });
        }

        // Inserir no banco de dados
        const result = await client.query(
            'INSERT INTO cep (codigo, id_logradouro) VALUES ($1, $2) RETURNING *',
            [codigo, idLogradouro]
        );

        // Buscar os dados completos do CEP criado
        const novoCEP = await client.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM cep c
            JOIN logradouro l ON c.id_logradouro = l.id_logradouro
            JOIN bairro b ON l.id_bairro = b.id_bairro
            JOIN cidade ci ON b.id_cidade = ci.id_cidade
            JOIN estado e ON ci.id_estado = e.id_estado
            WHERE c.id_cep = $1
        `, [result.rows[0].id_cep]);

        res.status(201).json({
            message: 'CEP criado com sucesso',
            data: novoCEP.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (CEP já existe)
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
            return res.status(409).json({
                message: 'Já existe um CEP com este código'
            });
        }

        res.status(500).json({
            message: 'Erro ao criar CEP',
            error: error.message
        });
        console.error('Erro ao criar CEP:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarCEP(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idCEP } = req.params;

        const {
            codigo,
            idLogradouro
        } = req.body;

        // Verificar se o CEP existe
        const cep = await client.query('SELECT * FROM cep WHERE id_cep = $1', [idCEP]);
        if (cep.rows.length === 0) {
            return res.status(404).json({ message: 'CEP não encontrado' });
        }

        // Validar formato do CEP se for fornecido
        if (codigo) {
            const cepRegex = /^\d{5}-\d{3}$/;
            if (!cepRegex.test(codigo)) {
                return res.status(400).json({
                    message: 'Formato do CEP inválido. Use o formato XXXXX-XXX'
                });
            }
        }

        // Verificar se o novo logradouro existe, se for fornecido
        if (idLogradouro) {
            const logradouro = await client.query('SELECT 1 FROM logradouro WHERE id_logradouro = $1', [idLogradouro]);
            if (logradouro.rows.length === 0) {
                return res.status(400).json({
                    message: 'Logradouro não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (codigo) updateFields.codigo = codigo;
        if (idLogradouro) updateFields.id_logradouro = idLogradouro;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE cep SET ';
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }

        query += setClauses.join(', ');
        query += ` WHERE id_cep = $${paramCount}`;
        values.push(idCEP);

        await client.query(query, values);

        // Buscar o CEP atualizado
        const updatedCEP = await client.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM cep c
            JOIN logradouro l ON c.id_logradouro = l.id_logradouro
            JOIN bairro b ON l.id_bairro = b.id_bairro
            JOIN cidade ci ON b.id_cidade = ci.id_cidade
            JOIN estado e ON ci.id_estado = e.id_estado
            WHERE c.id_cep = $1
        `, [idCEP]);

        res.status(200).json({
            message: 'CEP atualizado com sucesso',
            data: updatedCEP.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (CEP já existe)
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe um CEP com este código'
            });
        }

        res.status(500).json({
            message: 'Erro ao atualizar CEP',
            error: error.message
        });
        console.error('Erro ao atualizar CEP:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function excluirCEP(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idCEP } = req.params;

        // Verificar se o CEP existe
        const cep = await client.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM cep c
            JOIN logradouro l ON c.id_logradouro = l.id_logradouro
            JOIN bairro b ON l.id_bairro = b.id_bairro
            JOIN cidade ci ON b.id_cidade = ci.id_cidade
            JOIN estado e ON ci.id_estado = e.id_estado
            WHERE c.id_cep = $1
        `, [idCEP]);

        if (cep.rows.length === 0) {
            return res.status(404).json({ message: 'CEP não encontrado' });
        }

        await client.query('DELETE FROM cep WHERE id_cep = $1', [idCEP]);

        res.status(200).json({
            message: 'CEP excluído com sucesso',
            data: cep.rows[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === '23503') { // Código de violação de chave estrangeira no PostgreSQL
            return res.status(400).json({
                message: 'Não é possível excluir o CEP pois está sendo utilizado em Endereços'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir CEP',
            error: error.message
        });
        console.error('Erro ao excluir CEP:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerCEPs,
    buscarCEPPorId,
    criarCEP,
    atualizarCEP,
    excluirCEP
};