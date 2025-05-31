const sqlconnection = require('../../../connections/SQLConnections.js');

// Listar todos os estados com possibilidade de filtro por sigla
async function lerEstados(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        const { sigla, nome } = req.query;
        let query = `SELECT * FROM Estado`;
        const params = [];
        let whereClauses = [];
        
        if (sigla) {
            whereClauses.push('sigla = ?');
            params.push(sigla.toUpperCase());
        }
        
        if (nome) {
            whereClauses.push('nome LIKE ?');
            params.push(`%${nome}%`);
        }
        
        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        query += ' ORDER BY nome';
        
        const [result] = await sql.query(query, params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar estados',
            error: error.message
        });
        console.error('Erro ao listar estados:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

// Buscar estado por ID
async function buscarEstadoPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idEstado } = req.params;
        
        const [result] = await sql.query(
            'SELECT * FROM Estado WHERE idEstado = ?', 
            [idEstado]
        );

        if (result.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar estado',
            error: error.message
        });
        console.error('Erro ao buscar estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

// Buscar estado por sigla
async function buscarEstadoPorSigla(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { sigla } = req.params;
        
        const [result] = await sql.query(
            'SELECT * FROM Estado WHERE sigla = ?', 
            [sigla.toUpperCase()]
        );

        if (result.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar estado por sigla',
            error: error.message
        });
        console.error('Erro ao buscar estado por sigla:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

// Criar novo estado
async function criarEstado(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { nome, sigla } = req.body;

        // Validações
        if (!nome || !sigla) {
            return res.status(400).json({
                message: 'Nome e sigla são campos obrigatórios'
            });
        }

        if (sigla.length !== 2 || !/^[A-Za-z]{2}$/.test(sigla)) {
            return res.status(400).json({
                message: 'A sigla deve ter exatamente 2 letras'
            });
        }

        if (nome.length < 3 || nome.length > 30) {
            return res.status(400).json({
                message: 'O nome do estado deve ter entre 3 e 30 caracteres'
            });
        }

        // Inserir no banco
        const [result] = await sql.query(
            'INSERT INTO Estado (nome, sigla) VALUES (?, ?)',
            [nome, sigla.toUpperCase()]
        );

        // Buscar o estado criado
        const [novoEstado] = await sql.query(
            'SELECT * FROM Estado WHERE idEstado = ?', 
            [result.insertId]
        );

        res.status(201).json({
            message: 'Estado criado com sucesso',
            data: novoEstado[0]
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const message = error.message.includes('sigla') 
                ? 'Já existe um estado com esta sigla' 
                : 'Já existe um estado com este nome';
            return res.status(409).json({ message });
        }
        
        res.status(500).json({
            message: 'Erro ao criar estado',
            error: error.message
        });
        console.error('Erro ao criar estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

// Atualizar estado existente
async function atualizarEstado(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idEstado } = req.params;
        const { nome, sigla } = req.body;

        // Verificar se o estado existe
        const [estado] = await sql.query(
            'SELECT * FROM Estado WHERE idEstado = ?', 
            [idEstado]
        );
        if (estado.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        // Validações
        const updateFields = {};
        if (nome !== undefined) {
            if (nome.length < 3 || nome.length > 30) {
                return res.status(400).json({
                    message: 'O nome do estado deve ter entre 3 e 30 caracteres'
                });
            }
            updateFields.nome = nome;
        }

        if (sigla !== undefined) {
            if (sigla.length !== 2 || !/^[A-Za-z]{2}$/.test(sigla)) {
                return res.status(400).json({
                    message: 'A sigla deve ter exatamente 2 letras'
                });
            }
            updateFields.sigla = sigla.toUpperCase();
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ 
                message: 'Nenhum campo válido para atualização fornecido' 
            });
        }

        // Atualizar no banco
        await sql.query(
            'UPDATE Estado SET ? WHERE idEstado = ?',
            [updateFields, idEstado]
        );

        // Buscar o estado atualizado
        const [updatedEstado] = await sql.query(
            'SELECT * FROM Estado WHERE idEstado = ?', 
            [idEstado]
        );

        res.status(200).json({
            message: 'Estado atualizado com sucesso',
            data: updatedEstado[0]
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const message = error.message.includes('sigla') 
                ? 'Já existe um estado com esta sigla' 
                : 'Já existe um estado com este nome';
            return res.status(409).json({ message });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar estado',
            error: error.message
        });
        console.error('Erro ao atualizar estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

// Excluir estado
async function excluirEstado(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idEstado } = req.params;

        // Verificar se o estado existe
        const [estado] = await sql.query(
            'SELECT * FROM Estado WHERE idEstado = ?', 
            [idEstado]
        );
        
        if (estado.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        // Verificar se há cidades associadas
        const [cidades] = await sql.query(
            'SELECT 1 FROM Cidade WHERE idEstado = ? LIMIT 1',
            [idEstado]
        );
        
        if (cidades.length > 0) {
            return res.status(400).json({
                message: 'Não é possível excluir o estado pois existem cidades vinculadas a ele'
            });
        }

        await sql.query('DELETE FROM Estado WHERE idEstado = ?', [idEstado]);

        res.status(200).json({
            message: 'Estado excluído com sucesso',
            data: estado[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir estado',
            error: error.message
        });
        console.error('Erro ao excluir estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerEstados,
    buscarEstadoPorId,
    buscarEstadoPorSigla,
    criarEstado,
    atualizarEstado,
    excluirEstado
};