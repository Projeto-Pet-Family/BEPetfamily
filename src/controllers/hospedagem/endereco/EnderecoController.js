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

        // Iniciar transação para garantir consistência
        await client.query('BEGIN');

        // 1. Verificar se o estado existe, se não, criar
        let estadoId;
        try {
            // Primeiro tenta buscar pela sigla (ex: SP, RJ)
            const estadoResult = await client.query(
                'SELECT idestado FROM estado WHERE UPPER(sigla) = UPPER($1)',
                [estado.toUpperCase()]
            );

            if (estadoResult.rows.length > 0) {
                estadoId = estadoResult.rows[0].idestado;
                console.log(`Estado encontrado pela sigla: ${estado} (ID: ${estadoId})`);
            } else {
                // Se não encontrar pela sigla, tenta pelo nome
                const estadoNomeResult = await client.query(
                    'SELECT idestado FROM estado WHERE UPPER(nome) = UPPER($1)',
                    [estado]
                );

                if (estadoNomeResult.rows.length > 0) {
                    estadoId = estadoNomeResult.rows[0].idestado;
                    console.log(`Estado encontrado pelo nome: ${estado} (ID: ${estadoId})`);
                } else {
                    // Se não existir, criar novo estado
                    // Para estados brasileiros, precisamos saber o nome completo
                    // Vamos usar um mapeamento de siglas para nomes
                    const estadosMap = {
                        'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas',
                        'BA': 'Bahia', 'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo',
                        'GO': 'Goiás', 'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul',
                        'MG': 'Minas Gerais', 'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná',
                        'PE': 'Pernambuco', 'PI': 'Piauí', 'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte',
                        'RS': 'Rio Grande do Sul', 'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina',
                        'SP': 'São Paulo', 'SE': 'Sergipe', 'TO': 'Tocantins'
                    };

                    const sigla = estado.toUpperCase();
                    const nomeEstado = estadosMap[sigla] || estado;
                    
                    const novoEstado = await client.query(
                        'INSERT INTO estado (nome, sigla) VALUES ($1, $2) RETURNING idestado',
                        [nomeEstado, sigla]
                    );
                    estadoId = novoEstado.rows[0].idestado;
                    console.log(`Estado criado: ${nomeEstado} (${sigla}) - ID: ${estadoId}`);
                }
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao processar estado:', error);
            throw error;
        }

        // 2. Verificar se a cidade existe, se não, criar
        let cidadeId;
        try {
            const cidadeResult = await client.query(
                'SELECT idcidade FROM cidade WHERE UPPER(nome) = UPPER($1) AND idestado = $2',
                [cidade, estadoId]
            );

            if (cidadeResult.rows.length > 0) {
                cidadeId = cidadeResult.rows[0].idcidade;
                console.log(`Cidade encontrada: ${cidade} (ID: ${cidadeId})`);
            } else {
                // Criar nova cidade
                const novaCidade = await client.query(
                    'INSERT INTO cidade (nome, idestado) VALUES ($1, $2) RETURNING idcidade',
                    [cidade, estadoId]
                );
                cidadeId = novaCidade.rows[0].idcidade;
                console.log(`Cidade criada: ${cidade} (ID: ${cidadeId})`);
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao processar cidade:', error);
            throw error;
        }

        // 3. Verificar se o bairro existe, se não, criar
        let bairroId;
        try {
            const bairroResult = await client.query(
                'SELECT idbairro FROM bairro WHERE UPPER(nome) = UPPER($1) AND idcidade = $2',
                [bairro, cidadeId]
            );

            if (bairroResult.rows.length > 0) {
                bairroId = bairroResult.rows[0].idbairro;
                console.log(`Bairro encontrado: ${bairro} (ID: ${bairroId})`);
            } else {
                // Criar novo bairro
                const novoBairro = await client.query(
                    'INSERT INTO bairro (nome, idcidade) VALUES ($1, $2) RETURNING idbairro',
                    [bairro, cidadeId]
                );
                bairroId = novoBairro.rows[0].idbairro;
                console.log(`Bairro criado: ${bairro} (ID: ${bairroId})`);
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao processar bairro:', error);
            throw error;
        }

        // 4. Verificar se o logradouro existe, se não, criar
        let logradouroId;
        try {
            const logradouroResult = await client.query(
                'SELECT idlogradouro FROM logradouro WHERE UPPER(nome) = UPPER($1) AND idbairro = $2',
                [rua, bairroId]
            );

            if (logradouroResult.rows.length > 0) {
                logradouroId = logradouroResult.rows[0].idlogradouro;
                console.log(`Logradouro encontrado: ${rua} (ID: ${logradouroId})`);
            } else {
                // Criar novo logradouro
                const novoLogradouro = await client.query(
                    'INSERT INTO logradouro (nome, idbairro) VALUES ($1, $2) RETURNING idlogradouro',
                    [rua, bairroId]
                );
                logradouroId = novoLogradouro.rows[0].idlogradouro;
                console.log(`Logradouro criado: ${rua} (ID: ${logradouroId})`);
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao processar logradouro:', error);
            throw error;
        }

        // 5. Verificar se o CEP existe, se não, criar
        let cepId;
        try {
            const cepResult = await client.query(
                'SELECT idcep FROM cep WHERE codigo = $1',
                [cepFormatado]
            );

            if (cepResult.rows.length > 0) {
                cepId = cepResult.rows[0].idcep;
                console.log(`CEP encontrado: ${cepFormatado} (ID: ${cepId})`);
                
                // Verificar se o CEP está vinculado ao logradouro correto
                const cepLogradouro = await client.query(
                    'SELECT idlogradouro FROM cep WHERE idcep = $1',
                    [cepId]
                );
                
                if (cepLogradouro.rows[0].idlogradouro !== logradouroId) {
                    console.warn(`Atenção: CEP ${cepFormatado} já existe mas está vinculado a outro logradouro`);
                    // Neste caso, você pode optar por:
                    // 1. Criar um novo registro de CEP para este logradouro
                    // 2. Usar o CEP existente mesmo com logradouro diferente
                    // 3. Retornar erro
                    // Vou optar por criar um novo registro de CEP
                    const novoCEP = await client.query(
                        'INSERT INTO cep (codigo, idlogradouro) VALUES ($1, $2) RETURNING idcep',
                        [cepFormatado, logradouroId]
                    );
                    cepId = novoCEP.rows[0].idcep;
                    console.log(`Novo CEP criado para este logradouro: ID ${cepId}`);
                }
            } else {
                // Criar novo CEP
                const novoCEP = await client.query(
                    'INSERT INTO cep (codigo, idlogradouro) VALUES ($1, $2) RETURNING idcep',
                    [cepFormatado, logradouroId]
                );
                cepId = novoCEP.rows[0].idcep;
                console.log(`CEP criado: ${cepFormatado} (ID: ${cepId})`);
            }
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Erro ao processar CEP:', error);
            throw error;
        }

        // 6. Verificar se o endereço já existe (combinação de logradouro, número e CEP)
        const enderecoExistente = await client.query(
            'SELECT idendereco FROM endereco WHERE idlogradouro = $1 AND numero = $2 AND idcep = $3',
            [logradouroId, parseInt(numero), cepId]
        );

        let enderecoId;
        let enderecoCriado = false;

        if (enderecoExistente.rows.length > 0) {
            // Se o endereço já existe, retorna o ID existente
            enderecoId = enderecoExistente.rows[0].idendereco;
            console.log(`Endereço já existe: ID ${enderecoId}`);
        } else {
            // 7. Criar o endereço final
            console.log('Criando novo endereço...');
            const novoEndereco = await client.query(
                'INSERT INTO endereco (idlogradouro, numero, complemento, idcep) VALUES ($1, $2, $3, $4) RETURNING idendereco',
                [logradouroId, parseInt(numero), complemento || null, cepId]
            );

            enderecoId = novoEndereco.rows[0].idendereco;
            enderecoCriado = true;
            console.log(`Endereço criado com ID: ${enderecoId}`);
        }

        // Commit da transação
        await client.query('COMMIT');

        // 8. Buscar os dados completos do endereço
        const enderecoCompleto = await client.query(`
            SELECT 
                e.idendereco,
                e.numero,
                e.complemento,
                c.codigo as cep, 
                lo.nome as logradouro, 
                b.nome as bairro, 
                ci.nome as cidade, 
                es.nome as estado, 
                es.sigla,
                es.idestado,
                ci.idcidade,
                b.idbairro,
                lo.idlogradouro,
                c.idcep
            FROM endereco e
            JOIN cep c ON e.idcep = c.idcep
            JOIN logradouro lo ON e.idlogradouro = lo.idlogradouro
            JOIN bairro b ON lo.idbairro = b.idbairro
            JOIN cidade ci ON b.idcidade = ci.idcidade
            JOIN estado es ON ci.idestado = es.idestado
            WHERE e.idendereco = $1
        `, [enderecoId]);

        const responseData = {
            message: enderecoCriado ? 'Endereço criado com sucesso' : 'Endereço já existe no sistema',
            idendereco: enderecoId,
            data: enderecoCompleto.rows[0],
            created: enderecoCriado
        };

        res.status(enderecoCriado ? 201 : 200).json(responseData);

    } catch (error) {
        // Rollback em caso de erro
        if (client) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('Erro ao fazer rollback:', rollbackError);
            });
        }
        
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