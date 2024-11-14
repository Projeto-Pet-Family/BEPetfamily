const sqlconnection = require('../connections/SQLConnections.js')

async function lerServicos(req,res){
    try{
        const sql = await sqlconnection()

        const [response] = await sql.query('call GetServicos')

        res.status(200).send(response)

        await sql.end()

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler serviços, confira o console'
        })
        console.log(error)
    }
}

async function lerServicoID(req,res){
    try{
        const sql = await sqlconnection()

        const { idServico } = req.params

        const [response] = await sql.query('call GetServicoID(?)',[idServico])

        req.status(200).send(response)

        await sql.end()
        
    }catch(error){
        res.status(500).json({
            message:'Erro ao ler ID do serviço, confira o console'
        })
        console.log(error)
    }
}

async function inserirServico(req,res){
    try{
        const sql = await sqlconnection()

        const { descricao, preco, idHospedagem } = req.body

        await sql.query('call InsertServico(?,?,?)',[descricao,preco,idHospedagem])
        
        res.status(201).json({
            message:'Serviço inserido com sucesso!',
            data:{
                descricao,
                preco,
                idHospedagem
            }
        })

        await sql.end()

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler ID do serviço, confira o console'
        })
        console.log(error)
    }
}

async function excluirServico(req,res){
    try{
        const sql = await sqlconnection()

        const { idServico } = req.params

        await sql.query('call DeleteServico(?)',[idServico])

        res.status(200).json({
            message:'Servico deletado com sucesso!'
        })
        
        await sql.end()

    }catch(error){
        res.status(500).json({
            message:'Erro ao excluir do serviço, confira o console'
        })
        console.log(error)
    }
}

async function atualizarServico(req,res){
    try{
        const sql = await sqlconnection()
        
        const { idServico } = req.params

        const { descricao, preco } = req.body

        await sql.query('call UpdateServico(?,?,?)',[idServico,descricao,preco])

        res.status(200).json({
            message:'Servico atualizado com sucesso!',
            data:{
                idServico,
                descricao,
                preco
            }
        })

        await sql.end()

    }catch(error){
        res.status(500).json({
            message:'Erro ao atualizar serviço, confira o console'
        })
        console.log(error)
    }
}

module.exports = {
    lerServicos,
    lerServicoID,
    inserirServico,
    excluirServico,
    atualizarServico
}