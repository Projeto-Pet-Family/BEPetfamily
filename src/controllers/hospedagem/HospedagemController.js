const sqlconnection = require('../../connections/SQLConnections.js');

async function lerHospedagens(req, res) {
    let client;

    try {
        client = await sqlconnection();
        
        const query = `
            SELECT 
                h."idHospedagem",
                h.nome,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            ORDER BY h.nome
        `;
        
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar hospedagens',
            error: error.message
        });
        console.error('Erro ao listar hospedagens:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarHospedagemPorId(req, res) {
    let client;

    try {
        client = await sqlconnection();
        const { idHospedagem } = req.params;
        
        const query = `
            SELECT 
                h."idHospedagem",
                h.nome,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                cep."idCEP",
                log.nome as logradouro,
                log."idLogradouro",
                b.nome as bairro,
                b."idBairro",
                cid.nome as cidade,
                cid."idCidade",
                est.nome as estado,
                est.sigla,
                est."idEstado"
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            WHERE h."idHospedagem" = $1
        `;
        
        const result = await client.query(query, [idHospedagem]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar hospedagem',
            error: error.message
        });
        console.error('Erro ao buscar hospedagem:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarHospedagem(req, res) {
    let client;

    try {
        client = await sqlconnection();

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
        const endereco = await client.query('SELECT 1 FROM Endereco WHERE "idEndereco" = $1', [idEndereco]);
        if (endereco.rows.length === 0) {
            return res.status(400).json({
                message: 'Endereço não encontrado'
            });
        }

        // Inserir no banco de dados
        const result = await client.query(
            'INSERT INTO Hospedagem (nome, "idEndereco") VALUES ($1, $2) RETURNING "idHospedagem"',
            [nome, idEndereco]
        );

        // Buscar os dados completos da hospedagem criada
        const novaHospedagem = await client.query(`
            SELECT 
                h."idHospedagem",
                h.nome,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            WHERE h."idHospedagem" = $1
        `, [result.rows[0].idHospedagem]);

        res.status(201).json({
            message: 'Hospedagem criada com sucesso',
            data: novaHospedagem.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
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
        if (client) {
            await client.end();
        }
    }
}

async function atualizarHospedagem(req, res) {
    let client;

    try {
        client = await sqlconnection();
        const { idHospedagem } = req.params;

        const {
            nome,
            idEndereco
        } = req.body;

        // Verificar se a hospedagem existe
        const hospedagem = await client.query('SELECT * FROM Hospedagem WHERE "idHospedagem" = $1', [idHospedagem]);
        if (hospedagem.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        // Verificar se o novo endereço existe, se for fornecido
        if (idEndereco) {
            const endereco = await client.query('SELECT 1 FROM Endereco WHERE "idEndereco" = $1', [idEndereco]);
            if (endereco.rows.length === 0) {
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
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(updateFields)) {
            const columnName = key === 'idEndereco' ? '"idEndereco"' : key;
            setClauses.push(`${columnName} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
        
        query += setClauses.join(', ');
        query += ` WHERE "idHospedagem" = $${paramCount}`;
        values.push(idHospedagem);

        await client.query(query, values);

        // Buscar a hospedagem atualizada
        const updatedHospedagem = await client.query(`
            SELECT 
                h."idHospedagem",
                h.nome,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            WHERE h."idHospedagem" = $1
        `, [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem atualizada com sucesso',
            data: updatedHospedagem.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
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
        if (client) {
            await client.end();
        }
    }
}

async function excluirHospedagem(req, res) {
    let client;
    
    try {
        client = await sqlconnection();
        const { idHospedagem } = req.params;

        // Verificar se a hospedagem existe
        const hospedagem = await client.query(`
            SELECT 
                h."idHospedagem",
                h.nome,
                e."idEndereco",
                e.numero,
                e.complemento,
                cep.codigo as "CEP",
                log.nome as logradouro,
                b.nome as bairro,
                cid.nome as cidade,
                est.nome as estado,
                est.sigla
            FROM Hospedagem h
            JOIN Endereco e ON h."idEndereco" = e."idEndereco"
            JOIN CEP cep ON e."idCEP" = cep."idCEP"
            JOIN Logradouro log ON e."idLogradouro" = log."idLogradouro"
            JOIN Bairro b ON log."idBairro" = b."idBairro"
            JOIN Cidade cid ON b."idCidade" = cid."idCidade"
            JOIN Estado est ON cid."idEstado" = est."idEstado"
            WHERE h."idHospedagem" = $1
        `, [idHospedagem]);
        
        if (hospedagem.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        await client.query('DELETE FROM Hospedagem WHERE "idHospedagem" = $1', [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem excluída com sucesso',
            data: hospedagem.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir hospedagem',
            error: error.message
        });
        console.error('Erro ao excluir hospedagem:', error);
    } finally {
        if (client) {
            await client.end();
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