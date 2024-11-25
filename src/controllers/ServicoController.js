const sqlconnection = require('../connections/SQLConnections.js')

async function lerServicos(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const [response] = await sql.query('call GetServicos')

        res.status(200).send(response)

        await sql.end()

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler serviços, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function lerServicoID(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const { idServico } = req.params

        const [response] = await sql.query('call GetServicoID(?)',[idServico])

        req.status(200).send(response[0])

        await sql.end()
        
    }catch(error){
        res.status(500).json({
            message:'Erro ao ler ID do serviço, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function inserirServico(req,res){
    let sql
    try{
        sql = await sqlconnection()

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

    }catch(error){
        res.status(500).json({
            message:'Erro ao criar serviço, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function excluirServico(req,res){
    let sql
    try{
        const sql = await sqlconnection()

        const { idServico } = req.params

        await sql.query('call DeleteServico(?)',[idServico])

        res.status(200).json({
            message:'Servico deletado com sucesso!'
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao excluir serviço, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function atualizarServico(req,res){
    let sql
    try{
        sql = await sqlconnection()
        
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

    }catch(error){
        res.status(500).json({
            message:'Erro ao atualizar serviço, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

module.exports = {
    lerServicos,
    lerServicoID,
    inserirServico,
    excluirServico,
    atualizarServico
}