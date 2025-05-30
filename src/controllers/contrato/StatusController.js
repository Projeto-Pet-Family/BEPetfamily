const sqlconnection = require('../../connections/SQLConnections.js')

async function lerStatus(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const [result] = await sql.query('select * from Status')

        res.status(200).send(result)

    }catch(error){
        res.status(500).json({
            message:'Erro ao ler os status, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function inserirStatus(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const { descricao } = req.body

        await sql.query('call InsertStatus(?)',descricao)

        res.status(201).json({
            message:'Status criado com sucesso!',
            data:descricao
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao criar o status, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function updateStatus(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const { idStatus } = req.params
        
        const { descricao } = req.body

        await sql.query('call UpdateStatus(?,?)',[idStatus,descricao])

        res.status(200).json({
            message:'Status atualizado com sucesso!',
            data:{
                idStatus,
                descricao
            }
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao atualizar os status, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

async function deleteStatus(req,res){
    let sql
    try{
        sql = await sqlconnection()

        const { idStatus } = req.params

        await sql.query('call DeleteStatus(?)',idStatus)

        res.status(200).json({
            message:'Status deletado com sucesso',
        })

    }catch(error){
        res.status(500).json({
            message:'Erro ao deletar os status, confira o console'
        })
        console.log(error)
    }finally{
        if(sql){
            await sql.end()
        }
    }
}

module.exports = {
    lerStatus,
    inserirStatus,
    updateStatus,
    deleteStatus
}