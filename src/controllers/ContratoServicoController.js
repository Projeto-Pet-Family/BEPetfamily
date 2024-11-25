const sqlconnection = require('../connections/SQLConnections.js')

async function lerContratosServico(req,res){
    let sql

    try{
        const sql = await sqlconnection()

        const [result] = await sql.query('call GetContratosServico')

        res.status(200).send(result)

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler contratos servicos, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }

}

async function lerContratoServicoID(req,res){
    try{
        const sql = await sqlconnection()

        const { idContratoServico } = req.params

        const [result] = await sql.query('call GetContratosServico(?)',idContratoServico)

        res.status(200).send(result)

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler ID do contrato servico, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function inserirContratoServico(req,res){
    let sql
    try{
        const sql = await sqlconnection()

        const { idContrato, idServico } = req.body

        await sql.query('call InsertContratoServico(?,?)',[idContrato,idServico])

        res.status(201).json({
            message:'Contrato servico criado com sucesso!',
            data:{
                idContrato,
                idServico
            }
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao inserir contrato servico, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function updateContratoServico(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const { idContratoServico } = req.params

        const { 
            idContrato,
            idServico
        } = req.body

        await sql.query('call UpdateContratoServico(?,?,?)',[
            idContratoServico,
            idContrato,
            idServico
        ])

        res.status(200).json({
            message:'Contrato servico atualizado com sucesso!',
            data:{
                idContratoServico,
                idContrato,
                idServico
            }
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao atualizar contrato servico, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }

}

async function excluirContratoServico(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const { idContratoServico } = req.params

        await sql.query('call DeleteContratoServico(?)', [idContratoServico])

        res.status(200).json({
            message:'Contrato servico deletado com sucesso!'
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao excluir contrato servico, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

module.exports = {
    lerContratosServico,
    lerContratoServicoID,
    inserirContratoServico,
    updateContratoServico,
    excluirContratoServico
}