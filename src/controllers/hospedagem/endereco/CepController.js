const sqlconnection = require('../../../connections/SQLConnections.js');

async function lerCEPs(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        // Adiciona filtro por logradouro se fornecido
        const { logradouroId } = req.query;
        let query = `
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM CEP c
            JOIN Logradouro l ON c.idLogradouro = l.idLogradouro
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado e ON ci.idEstado = e.idEstado
        `;
        const params = [];
        
        if (logradouroId) {
            query += ' WHERE c.idLogradouro = ?';
            params.push(logradouroId);
        }
        
        query += ' ORDER BY c.codigo';
        
        const [result] = await sql.query(query, params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar CEPs',
            error: error.message
        });
        console.error('Erro ao listar CEPs:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarCEPPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idCEP } = req.params;
        
        const [result] = await sql.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM CEP c
            JOIN Logradouro l ON c.idLogradouro = l.idLogradouro
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado e ON ci.idEstado = e.idEstado
            WHERE c.idCEP = ?
        `, [idCEP]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'CEP não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar CEP',
            error: error.message
        });
        console.error('Erro ao buscar CEP:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarCEP(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

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
        const [logradouro] = await sql.query('SELECT 1 FROM Logradouro WHERE idLogradouro = ?', [idLogradouro]);
        if (logradouro.length === 0) {
            return res.status(400).json({
                message: 'Logradouro não encontrado'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO CEP (codigo, idLogradouro) VALUES (?, ?)',
            [codigo, idLogradouro]
        );

        // Buscar os dados completos do CEP criado
        const [novoCEP] = await sql.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM CEP c
            JOIN Logradouro l ON c.idLogradouro = l.idLogradouro
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado e ON ci.idEstado = e.idEstado
            WHERE c.idCEP = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'CEP criado com sucesso',
            data: novoCEP[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (CEP já existe)
        if (error.code === 'ER_DUP_ENTRY') {
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
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarCEP(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idCEP } = req.params;

        const {
            codigo,
            idLogradouro
        } = req.body;

        // Verificar se o CEP existe
        const [cep] = await sql.query('SELECT * FROM CEP WHERE idCEP = ?', [idCEP]);
        if (cep.length === 0) {
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
            const [logradouro] = await sql.query('SELECT 1 FROM Logradouro WHERE idLogradouro = ?', [idLogradouro]);
            if (logradouro.length === 0) {
                return res.status(400).json({
                    message: 'Logradouro não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (codigo) updateFields.codigo = codigo;
        if (idLogradouro) updateFields.idLogradouro = idLogradouro;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE CEP SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idCEP = ?';
        values.push(idCEP);

        await sql.query(query, values);

        // Buscar o CEP atualizado
        const [updatedCEP] = await sql.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM CEP c
            JOIN Logradouro l ON c.idLogradouro = l.idLogradouro
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado e ON ci.idEstado = e.idEstado
            WHERE c.idCEP = ?
        `, [idCEP]);

        res.status(200).json({
            message: 'CEP atualizado com sucesso',
            data: updatedCEP[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (CEP já existe)
        if (error.code === 'ER_DUP_ENTRY') {
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
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirCEP(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idCEP } = req.params;

        // Verificar se o CEP existe
        const [cep] = await sql.query(`
            SELECT c.*, l.nome as logradouro, b.nome as bairro, ci.nome as cidade, e.nome as estado, e.sigla 
            FROM CEP c
            JOIN Logradouro l ON c.idLogradouro = l.idLogradouro
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado e ON ci.idEstado = e.idEstado
            WHERE c.idCEP = ?
        `, [idCEP]);
        
        if (cep.length === 0) {
            return res.status(404).json({ message: 'CEP não encontrado' });
        }

        await sql.query('DELETE FROM CEP WHERE idCEP = ?', [idCEP]);

        res.status(200).json({
            message: 'CEP excluído com sucesso',
            data: cep[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
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
        if (sql) {
            await sql.end();
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