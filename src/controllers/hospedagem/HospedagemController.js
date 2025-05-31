const sqlconnection = require('../../connections/SQLConnections.js');

async function lerHospedagens(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        const query = `
            SELECT 
                h.idHospedagem,
                h.nome,
                e.idEndereco,
                e.numero,
                e.complemento,
                cep.codigo as CEP,
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            ORDER BY h.nome
        `;
        
        const [result] = await sql.query(query);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar hospedagens',
            error: error.message
        });
        console.error('Erro ao listar hospedagens:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarHospedagemPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;
        
        const query = `
            SELECT 
                h.idHospedagem,
                h.nome,
                e.idEndereco,
                e.numero,
                e.complemento,
                cep.codigo as CEP,
                cep.idCEP,
                log.nome as logradouro,
                log.idLogradouro,
                b.nome as bairro,
                b.idBairro,
                cid.nome as cidade,
                cid.idCidade,
                est.nome as estado,
                est.sigla,
                est.idEstado
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            WHERE h.idHospedagem = ?
        `;
        
        const [result] = await sql.query(query, [idHospedagem]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar hospedagem',
            error: error.message
        });
        console.error('Erro ao buscar hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarHospedagem(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            nome,
            idEndereco
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !idEndereco) {
            return res.status(400).json({
                message: 'Nome e ID do endereço são campos obrigatórios'
            });
        }

        // Verificar se o endereço existe
        const [endereco] = await sql.query('SELECT 1 FROM Endereco WHERE idEndereco = ?', [idEndereco]);
        if (endereco.length === 0) {
            return res.status(400).json({
                message: 'Endereço não encontrado'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Hospedagem (nome, idEndereco) VALUES (?, ?)',
            [nome, idEndereco]
        );

        // Buscar os dados completos da hospedagem criada
        const [novaHospedagem] = await sql.query(`
            SELECT 
                h.idHospedagem,
                h.nome,
                e.idEndereco,
                e.numero,
                e.complemento,
                cep.codigo as CEP,
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            WHERE h.idHospedagem = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Hospedagem criada com sucesso',
            data: novaHospedagem[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe uma hospedagem com este nome no mesmo endereço'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar hospedagem',
            error: error.message
        });
        console.error('Erro ao criar hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarHospedagem(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;

        const {
            nome,
            idEndereco
        } = req.body;

        // Verificar se a hospedagem existe
        const [hospedagem] = await sql.query('SELECT * FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);
        if (hospedagem.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        // Verificar se o novo endereço existe, se for fornecido
        if (idEndereco) {
            const [endereco] = await sql.query('SELECT 1 FROM Endereco WHERE idEndereco = ?', [idEndereco]);
            if (endereco.length === 0) {
                return res.status(400).json({
                    message: 'Endereço não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (idEndereco) updateFields.idEndereco = idEndereco;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Hospedagem SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idHospedagem = ?';
        values.push(idHospedagem);

        await sql.query(query, values);

        // Buscar a hospedagem atualizada
        const [updatedHospedagem] = await sql.query(`
            SELECT 
                h.idHospedagem,
                h.nome,
                e.idEndereco,
                e.numero,
                e.complemento,
                cep.codigo as CEP,
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            WHERE h.idHospedagem = ?
        `, [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem atualizada com sucesso',
            data: updatedHospedagem[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe uma hospedagem com este nome no mesmo endereço'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar hospedagem',
            error: error.message
        });
        console.error('Erro ao atualizar hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirHospedagem(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;

        // Verificar se a hospedagem existe
        const [hospedagem] = await sql.query(`
            SELECT 
                h.idHospedagem,
                h.nome,
                e.idEndereco,
                e.numero,
                e.complemento,
                cep.codigo as CEP,
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h.idEndereco = e.idEndereco
            JOIN CEP cep ON e.idCEP = cep.idCEP
            JOIN Logradouro log ON e.idLogradouro = log.idLogradouro
            JOIN Bairro b ON log.idBairro = b.idBairro
            JOIN Cidade cid ON b.idCidade = cid.idCidade
            JOIN Estado est ON cid.idEstado = est.idEstado
            WHERE h.idHospedagem = ?
        `, [idHospedagem]);
        
        if (hospedagem.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        await sql.query('DELETE FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem excluída com sucesso',
            data: hospedagem[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir hospedagem',
            error: error.message
        });
        console.error('Erro ao excluir hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerHospedagens,
    buscarHospedagemPorId,
    criarHospedagem,
    atualizarHospedagem,
    excluirHospedagem
};