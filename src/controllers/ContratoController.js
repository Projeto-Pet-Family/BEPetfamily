const sqlconnection = require('../connections/SQLConnections.js')

async function lerContratos(req,res){
    try{
        const sql = await sqlconnection()

        const [result] = await sql.query('call GetContrato')

        res.status(200).send(result)

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler os contratos, confira o console'
        })
        console.log(error)
    }
}

async function filtrarContratosStatus(req,res){
    try{
        const sql = await sqlconnection()

        const { idStatus } = req.params

        const [result] = await sql.query('Call GetContratosStatus(?)',[idStatus])

        res.status(200).send(result)

    }catch(error){
        res.status(500).json({
            message:'Erro ao filtrar os contratos, confira o console'
        })
        console.log(error)
    }
}

async function inserirContrato(req,res){
    try{
        const sql = await sqlconnection()

        const { 
            idHospedagem, 
            idUsuario, 
            idStatus, 
            dataInicio, 
            dataFim 
        } = req.body

        await sql.query('call InsertContrato(?,?,?,?,?)',[
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim
        ])

        res.status(201).json({
            message:'Contrato criado com sucesso!',
            data:{
                idHospedagem,
                idUsuario,
                idStatus,
                dataInicio,
                dataFim
            }
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao criar o contrato, confira o console'
        })
        console.log(error)
    }
}

async function updateContrato(req, res) {
    try {
        const sql = await sqlconnection();

        const { idContrato } = req.params;

        const {
            idHospedagem = null,
            idUsuario = null,
            idStatus = null,
            dataInicio = null,
            dataFim = null,
            valorTotal = null
        } = req.body;

        await sql.query('call UpdateContrato(?,?,?,?,?,?,?)', [
            idContrato,
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim,
            valorTotal
        ]);

        await res.status(200).json({
            message: 'Contrato atualizado com sucesso',
            data: {
                idContrato,
                idHospedagem,
                idUsuario,
                idStatus,
                dataInicio,
                dataFim,
                valorTotal
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar contrato, confira o console'
        });
        console.log(error);
    }
}

async function excluirContrato(req,res){
    try{
        const sql = await sqlconnection()

        const { idContrato } = req.params

        await sql.query('call DeleteContrato(?)',idContrato)

        res.status(200).json({message:'Contrato deletado com sucesso!'})

    }catch(error){
        res.status(500).json({
            message:'Erro ao excluir contrato, confira o console'
        })
        console.log(error)
    }
}

module.exports = {
    lerContratos,
    filtrarContratosStatus,
    inserirContrato,
    updateContrato,
    excluirContrato,
}