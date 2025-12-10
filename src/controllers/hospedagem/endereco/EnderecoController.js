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

async function criarEnderecoCompleto(req, res) {
    let client;

    try {
        client = await pool.connect();

        // Dados recebidos do frontend
        const { 
            rua,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            cep
        } = req.body;

        console.log('Dados recebidos para criar endereço completo:', req.body);

        // Validar campos obrigatórios
        if (!rua || !numero || !bairro || !cidade || !estado || !cep) {
            return res.status(400).json({
                message: 'Todos os campos são obrigatórios (exceto complemento)'
            });
        }

        // Validar o número
        if (isNaN(numero)) {
            return res.status(400).json({
                message: 'Número deve ser um valor numérico'
            });
        }

        // Limpar e formatar o CEP (remover traços)
        const cepFormatado = cep.replace(/\D/g, '');

        // Verificar se o estado existe, se não, criar
        let estadoId;
        try {
            const estadoResult = await client.query(
                'SELECT "idEstado" FROM Estado WHERE UPPER(sigla) = UPPER($1) OR UPPER(nome) = UPPER($1)',
                [estado]
            );

            if (estadoResult.rows.length > 0) {
                estadoId = estadoResult.rows[0].idEstado;
                console.log(`Estado encontrado: ${estado} (ID: ${estadoId})`);
            } else {
                // Criar novo estado
                const novoEstado = await client.query(
                    'INSERT INTO Estado (nome, sigla) VALUES ($1, UPPER($2)) RETURNING "idEstado"',
                    [estado, estado.substring(0, 2)] // Usa as 2 primeiras letras como sigla
                );
                estadoId = novoEstado.rows[0].idEstado;
                console.log(`Estado criado: ${estado} (ID: ${estadoId})`);
            }
        } catch (error) {
            console.error('Erro ao processar estado:', error);
            throw error;
        }

        // Verificar se a cidade existe, se não, criar
        let cidadeId;
        try {
            const cidadeResult = await client.query(
                'SELECT "idCidade" FROM Cidade WHERE UPPER(nome) = UPPER($1) AND "idEstado" = $2',
                [cidade, estadoId]
            );

            if (cidadeResult.rows.length > 0) {
                cidadeId = cidadeResult.rows[0].idCidade;
                console.log(`Cidade encontrada: ${cidade} (ID: ${cidadeId})`);
            } else {
                // Criar nova cidade
                const novaCidade = await client.query(
                    'INSERT INTO Cidade (nome, "idEstado") VALUES ($1, $2) RETURNING "idCidade"',
                    [cidade, estadoId]
                );
                cidadeId = novaCidade.rows[0].idCidade;
                console.log(`Cidade criada: ${cidade} (ID: ${cidadeId})`);
            }
        } catch (error) {
            console.error('Erro ao processar cidade:', error);
            throw error;
        }

        // Verificar se o bairro existe, se não, criar
        let bairroId;
        try {
            const bairroResult = await client.query(
                'SELECT "idBairro" FROM Bairro WHERE UPPER(nome) = UPPER($1) AND "idCidade" = $2',
                [bairro, cidadeId]
            );

            if (bairroResult.rows.length > 0) {
                bairroId = bairroResult.rows[0].idBairro;
                console.log(`Bairro encontrado: ${bairro} (ID: ${bairroId})`);
            } else {
                // Criar novo bairro
                const novoBairro = await client.query(
                    'INSERT INTO Bairro (nome, "idCidade") VALUES ($1, $2) RETURNING "idBairro"',
                    [bairro, cidadeId]
                );
                bairroId = novoBairro.rows[0].idBairro;
                console.log(`Bairro criado: ${bairro} (ID: ${bairroId})`);
            }
        } catch (error) {
            console.error('Erro ao processar bairro:', error);
            throw error;
        }

        // Verificar se o logradouro existe, se não, criar
        let logradouroId;
        try {
            const logradouroResult = await client.query(
                'SELECT "idLogradouro" FROM Logradouro WHERE UPPER(nome) = UPPER($1) AND "idBairro" = $2',
                [rua, bairroId]
            );

            if (logradouroResult.rows.length > 0) {
                logradouroId = logradouroResult.rows[0].idLogradouro;
                console.log(`Logradouro encontrado: ${rua} (ID: ${logradouroId})`);
            } else {
                // Criar novo logradouro
                const novoLogradouro = await client.query(
                    'INSERT INTO Logradouro (nome, "idBairro") VALUES ($1, $2) RETURNING "idLogradouro"',
                    [rua, bairroId]
                );
                logradouroId = novoLogradouro.rows[0].idLogradouro;
                console.log(`Logradouro criado: ${rua} (ID: ${logradouroId})`);
            }
        } catch (error) {
            console.error('Erro ao processar logradouro:', error);
            throw error;
        }

        // Verificar se o CEP existe, se não, criar
        let cepId;
        try {
            const cepResult = await client.query(
                'SELECT "idCEP" FROM CEP WHERE codigo = $1',
                [cepFormatado]
            );

            if (cepResult.rows.length > 0) {
                cepId = cepResult.rows[0].idCEP;
                console.log(`CEP encontrado: ${cepFormatado} (ID: ${cepId})`);
            } else {
                // Criar novo CEP
                const novoCEP = await client.query(
                    'INSERT INTO CEP (codigo, "idLogradouro") VALUES ($1, $2) RETURNING "idCEP"',
                    [cepFormatado, logradouroId]
                );
                cepId = novoCEP.rows[0].idCEP;
                console.log(`CEP criado: ${cepFormatado} (ID: ${cepId})`);
            }
        } catch (error) {
            console.error('Erro ao processar CEP:', error);
            throw error;
        }

        // Verificar se o endereço já existe (combinação de logradouro, número e CEP)
        const enderecoExistente = await client.query(
            'SELECT "idEndereco" FROM Endereco WHERE "idLogradouro" = $1 AND numero = $2 AND "idCEP" = $3',
            [logradouroId, numero, cepId]
        );

        if (enderecoExistente.rows.length > 0) {
            // Se o endereço já existe, retorna o ID existente
            const enderecoId = enderecoExistente.rows[0].idEndereco;
            console.log(`Endereço já existe: ID ${enderecoId}`);
            
            // Buscar dados completos do endereço existente
            const enderecoCompleto = await client.query(`
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
            `, [enderecoId]);

            return res.status(200).json({
                message: 'Endereço já existe no sistema',
                idendereco: enderecoId,
                data: enderecoCompleto.rows[0],
                created: false
            });
        }

        // Criar o endereço final
        console.log('Criando novo endereço...');
        const novoEndereco = await client.query(
            'INSERT INTO Endereco ("idLogradouro", numero, complemento, "idCEP") VALUES ($1, $2, $3, $4) RETURNING "idEndereco"',
            [logradouroId, numero, complemento || null, cepId]
        );

        const enderecoId = novoEndereco.rows[0].idEndereco;
        console.log(`Endereço criado com ID: ${enderecoId}`);

        // Buscar os dados completos do endereço criado
        const enderecoCompleto = await client.query(`
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
        `, [enderecoId]);

        res.status(201).json({
            message: 'Endereço criado com sucesso',
            idendereco: enderecoId,
            data: enderecoCompleto.rows[0],
            created: true
        });

    } catch (error) {
        console.error('Erro ao criar endereço completo:', error);
        
        // Erros específicos
        if (error.code === '23505') { // Violação de constraint única
            return res.status(409).json({
                message: 'Endereço já existe no sistema',
                error: error.message
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar endereço completo',
            error: error.message,
            details: error.detail
        });
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
    excluirEndereco,
    criarEnderecoCompleto
};