const sqlconnection = require('../../../connections/SQLConnections.js');

async function lerEnderecos(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        // Adiciona filtros se fornecidos
        const { logradouroId, cepId } = req.query;
        let query = `
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e.idCEP = c.idCEP
            JOIN Logradouro lo ON e.idLogradouro = lo.idLogradouro
            JOIN Bairro b ON lo.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado es ON ci.idEstado = es.idEstado
        `;
        const params = [];
        let whereAdded = false;
        
        if (logradouroId) {
            query += whereAdded ? ' AND' : ' WHERE';
            query += ' e.idLogradouro = ?';
            params.push(logradouroId);
            whereAdded = true;
        }
        
        if (cepId) {
            query += whereAdded ? ' AND' : ' WHERE';
            query += ' e.idCEP = ?';
            params.push(cepId);
            whereAdded = true;
        }
        
        query += ' ORDER BY lo.nome, e.numero';
        
        const [result] = await sql.query(query, params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar endereços',
            error: error.message
        });
        console.error('Erro ao listar endereços:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarEnderecoPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idEndereco } = req.params;
        
        const [result] = await sql.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e.idCEP = c.idCEP
            JOIN Logradouro lo ON e.idLogradouro = lo.idLogradouro
            JOIN Bairro b ON lo.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado es ON ci.idEstado = es.idEstado
            WHERE e.idEndereco = ?
        `, [idEndereco]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Endereço não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar endereço',
            error: error.message
        });
        console.error('Erro ao buscar endereço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarEndereco(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            idLogradouro,
            numero,
            complemento,
            idCEP
        } = req.body;

        // Validar campos obrigatórios
        if (!idLogradouro || numero === undefined || !idCEP) {
            return res.status(400).json({
                message: 'Logradouro, número e CEP são campos obrigatórios'
            });
        }

        // Verificar se o número é válido
        if (isNaN(numero)) {
            return res.status(400).json({
                message: 'Número deve ser um valor numérico'
            });
        }

        // Verificar se o logradouro existe
        const [logradouro] = await sql.query('SELECT 1 FROM Logradouro WHERE idLogradouro = ?', [idLogradouro]);
        if (logradouro.length === 0) {
            return res.status(400).json({
                message: 'Logradouro não encontrado'
            });
        }

        // Verificar se o CEP existe
        const [cep] = await sql.query('SELECT 1 FROM CEP WHERE idCEP = ?', [idCEP]);
        if (cep.length === 0) {
            return res.status(400).json({
                message: 'CEP não encontrado'
            });
        }

        // Verificar se o CEP pertence ao logradouro
        const [cepLogradouro] = await sql.query('SELECT idLogradouro FROM CEP WHERE idCEP = ?', [idCEP]);
        if (cepLogradouro[0].idLogradouro !== idLogradouro) {
            return res.status(400).json({
                message: 'O CEP não pertence ao logradouro especificado'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Endereco (idLogradouro, numero, complemento, idCEP) VALUES (?, ?, ?, ?)',
            [idLogradouro, numero, complemento || null, idCEP]
        );

        // Buscar os dados completos do endereço criado
        const [novoEndereco] = await sql.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e.idCEP = c.idCEP
            JOIN Logradouro lo ON e.idLogradouro = lo.idLogradouro
            JOIN Bairro b ON lo.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado es ON ci.idEstado = es.idEstado
            WHERE e.idEndereco = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Endereço criado com sucesso',
            data: novoEndereco[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (endereço já existe)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um endereço com este número no mesmo logradouro e CEP'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar endereço',
            error: error.message
        });
        console.error('Erro ao criar endereço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarEndereco(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idEndereco } = req.params;

        const {
            idLogradouro,
            numero,
            complemento,
            idCEP
        } = req.body;

        // Verificar se o endereço existe
        const [endereco] = await sql.query('SELECT * FROM Endereco WHERE idEndereco = ?', [idEndereco]);
        if (endereco.length === 0) {
            return res.status(404).json({ message: 'Endereço não encontrado' });
        }

        // Verificar se o número é válido, se for fornecido
        if (numero !== undefined && isNaN(numero)) {
            return res.status(400).json({
                message: 'Número deve ser um valor numérico'
            });
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

        // Verificar se o novo CEP existe, se for fornecido
        if (idCEP) {
            const [cep] = await sql.query('SELECT 1 FROM CEP WHERE idCEP = ?', [idCEP]);
            if (cep.length === 0) {
                return res.status(400).json({
                    message: 'CEP não encontrado'
                });
            }
        }

        // Verificar se o CEP pertence ao logradouro, se ambos forem fornecidos
        if (idCEP && idLogradouro) {
            const [cepLogradouro] = await sql.query('SELECT idLogradouro FROM CEP WHERE idCEP = ?', [idCEP]);
            if (cepLogradouro[0].idLogradouro !== idLogradouro) {
                return res.status(400).json({
                    message: 'O CEP não pertence ao logradouro especificado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (idLogradouro) updateFields.idLogradouro = idLogradouro;
        if (numero !== undefined) updateFields.numero = numero;
        if (complemento !== undefined) updateFields.complemento = complemento;
        if (idCEP) updateFields.idCEP = idCEP;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Endereco SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value === null ? null : value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idEndereco = ?';
        values.push(idEndereco);

        await sql.query(query, values);

        // Buscar o endereço atualizado
        const [updatedEndereco] = await sql.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e.idCEP = c.idCEP
            JOIN Logradouro lo ON e.idLogradouro = lo.idLogradouro
            JOIN Bairro b ON lo.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado es ON ci.idEstado = es.idEstado
            WHERE e.idEndereco = ?
        `, [idEndereco]);

        res.status(200).json({
            message: 'Endereço atualizado com sucesso',
            data: updatedEndereco[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (endereço já existe)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um endereço com este número no mesmo logradouro e CEP'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar endereço',
            error: error.message
        });
        console.error('Erro ao atualizar endereço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirEndereco(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idEndereco } = req.params;

        // Verificar se o endereço existe
        const [endereco] = await sql.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e.idCEP = c.idCEP
            JOIN Logradouro lo ON e.idLogradouro = lo.idLogradouro
            JOIN Bairro b ON lo.idBairro = b.idBairro
            JOIN Cidade ci ON b.idCidade = ci.idCidade
            JOIN Estado es ON ci.idEstado = es.idEstado
            WHERE e.idEndereco = ?
        `, [idEndereco]);
        
        if (endereco.length === 0) {
            return res.status(404).json({ message: 'Endereço não encontrado' });
        }

        await sql.query('DELETE FROM Endereco WHERE idEndereco = ?', [idEndereco]);

        res.status(200).json({
            message: 'Endereço excluído com sucesso',
            data: endereco[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir endereço',
            error: error.message
        });
        console.error('Erro ao excluir endereço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerEnderecos,
    buscarEnderecoPorId,
    criarEndereco,
    atualizarEndereco,
    excluirEndereco
};