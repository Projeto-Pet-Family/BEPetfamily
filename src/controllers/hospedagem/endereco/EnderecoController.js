const pool = require('../../../connections/SQLConnections.js');

async function lerEnderecos(req, res) {
    let client;

    try {
        client = await pool.connect();
        
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
        let paramCount = 1;
        
        if (logradouroId) {
            query += whereAdded ? ' AND' : ' WHERE';
            query += ` e."idLogradouro" = $${paramCount}`;
            params.push(logradouroId);
            paramCount++;
            whereAdded = true;
        }
        
        if (cepId) {
            query += whereAdded ? ' AND' : ' WHERE';
            query += ` e."idCEP" = $${paramCount}`;
            params.push(cepId);
            paramCount++;
            whereAdded = true;
        }
        
        query += ' ORDER BY lo.nome, e.numero';
        
        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar endereços',
            error: error.message
        });
        console.error('Erro ao listar endereços:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarEnderecoPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idEndereco } = req.params;
        
        const result = await client.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e."idCEP" = c."idCEP"
            JOIN Logradouro lo ON e."idLogradouro" = lo."idLogradouro"
            JOIN Bairro b ON lo."idBairro" = b."idBairro"
            JOIN Cidade ci ON b."idCidade" = ci."idCidade"
            JOIN Estado es ON ci."idEstado" = es."idEstado"
            WHERE e."idEndereco" = $1
        `, [idEndereco]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Endereço não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar endereço',
            error: error.message
        });
        console.error('Erro ao buscar endereço:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarEndereco(req, res) {
    let client;

    try {
        client = await pool.connect();

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
        const logradouro = await client.query('SELECT 1 FROM Logradouro WHERE "idLogradouro" = $1', [idLogradouro]);
        if (logradouro.rows.length === 0) {
            return res.status(400).json({
                message: 'Logradouro não encontrado'
            });
        }

        // Verificar se o CEP existe
        const cep = await client.query('SELECT 1 FROM CEP WHERE "idCEP" = $1', [idCEP]);
        if (cep.rows.length === 0) {
            return res.status(400).json({
                message: 'CEP não encontrado'
            });
        }

        // Verificar se o CEP pertence ao logradouro
        const cepLogradouro = await client.query('SELECT "idLogradouro" FROM CEP WHERE "idCEP" = $1', [idCEP]);
        if (cepLogradouro.rows[0].idLogradouro !== idLogradouro) {
            return res.status(400).json({
                message: 'O CEP não pertence ao logradouro especificado'
            });
        }

        // Inserir no banco de dados
        const result = await client.query(
            'INSERT INTO Endereco ("idLogradouro", numero, complemento, "idCEP") VALUES ($1, $2, $3, $4) RETURNING "idEndereco"',
            [idLogradouro, numero, complemento || null, idCEP]
        );

        const novoId = result.rows[0].idEndereco;

        // Buscar os dados completos do endereço criado
        const novoEndereco = await client.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e."idCEP" = c."idCEP"
            JOIN Logradouro lo ON e."idLogradouro" = lo."idLogradouro"
            JOIN Bairro b ON lo."idBairro" = b."idBairro"
            JOIN Cidade ci ON b."idCidade" = ci."idCidade"
            JOIN Estado es ON ci."idEstado" = es."idEstado"
            WHERE e."idEndereco" = $1
        `, [novoId]);

        res.status(201).json({
            message: 'Endereço criado com sucesso',
            data: novoEndereco.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (endereço já existe)
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
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
        if (client) {
            await client.end();
        }
    }
}

async function atualizarEndereco(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idEndereco } = req.params;

        const {
            idLogradouro,
            numero,
            complemento,
            idCEP
        } = req.body;

        // Verificar se o endereço existe
        const endereco = await client.query('SELECT * FROM Endereco WHERE "idEndereco" = $1', [idEndereco]);
        if (endereco.rows.length === 0) {
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
            const logradouro = await client.query('SELECT 1 FROM Logradouro WHERE "idLogradouro" = $1', [idLogradouro]);
            if (logradouro.rows.length === 0) {
                return res.status(400).json({
                    message: 'Logradouro não encontrado'
                });
            }
        }

        // Verificar se o novo CEP existe, se for fornecido
        if (idCEP) {
            const cep = await client.query('SELECT 1 FROM CEP WHERE "idCEP" = $1', [idCEP]);
            if (cep.rows.length === 0) {
                return res.status(400).json({
                    message: 'CEP não encontrado'
                });
            }
        }

        // Verificar se o CEP pertence ao logradouro, se ambos forem fornecidos
        if (idCEP && idLogradouro) {
            const cepLogradouro = await client.query('SELECT "idLogradouro" FROM CEP WHERE "idCEP" = $1', [idCEP]);
            if (cepLogradouro.rows[0].idLogradouro !== idLogradouro) {
                return res.status(400).json({
                    message: 'O CEP não pertence ao logradouro especificado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        const values = [];
        let paramCount = 1;
        let setClauses = [];

        if (idLogradouro) {
            setClauses.push(`"idLogradouro" = $${paramCount}`);
            values.push(idLogradouro);
            paramCount++;
        }
        if (numero !== undefined) {
            setClauses.push(`numero = $${paramCount}`);
            values.push(numero);
            paramCount++;
        }
        if (complemento !== undefined) {
            setClauses.push(`complemento = $${paramCount}`);
            values.push(complemento);
            paramCount++;
        }
        if (idCEP) {
            setClauses.push(`"idCEP" = $${paramCount}`);
            values.push(idCEP);
            paramCount++;
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        values.push(idEndereco);
        const query = `UPDATE Endereco SET ${setClauses.join(', ')} WHERE "idEndereco" = $${paramCount}`;

        await client.query(query, values);

        // Buscar o endereço atualizado
        const updatedEndereco = await client.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e."idCEP" = c."idCEP"
            JOIN Logradouro lo ON e."idLogradouro" = lo."idLogradouro"
            JOIN Bairro b ON lo."idBairro" = b."idBairro"
            JOIN Cidade ci ON b."idCidade" = ci."idCidade"
            JOIN Estado es ON ci."idEstado" = es."idEstado"
            WHERE e."idEndereco" = $1
        `, [idEndereco]);

        res.status(200).json({
            message: 'Endereço atualizado com sucesso',
            data: updatedEndereco.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (endereço já existe)
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
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
        if (client) {
            await client.end();
        }
    }
}

async function excluirEndereco(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idEndereco } = req.params;

        // Verificar se o endereço existe
        const endereco = await client.query(`
            SELECT 
                e.*, 
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla
            FROM Endereco e
            JOIN CEP c ON e."idCEP" = c."idCEP"
            JOIN Logradouro lo ON e."idLogradouro" = lo."idLogradouro"
            JOIN Bairro b ON lo."idBairro" = b."idBairro"
            JOIN Cidade ci ON b."idCidade" = ci."idCidade"
            JOIN Estado es ON ci."idEstado" = es."idEstado"
            WHERE e."idEndereco" = $1
        `, [idEndereco]);
        
        if (endereco.rows.length === 0) {
            return res.status(404).json({ message: 'Endereço não encontrado' });
        }

        await client.query('DELETE FROM Endereco WHERE "idEndereco" = $1', [idEndereco]);

        res.status(200).json({
            message: 'Endereço excluído com sucesso',
            data: endereco.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir endereço',
            error: error.message
        });
        console.error('Erro ao excluir endereço:', error);
    } finally {
        if (client) {
            await client.end();
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