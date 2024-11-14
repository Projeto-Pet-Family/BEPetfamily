const mysql = require('mysql2/promise')

async function SqlConnection(){
    const connection = await mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'',
        database:'petfamily'
    })

    console.log('Conectado ao MYSQL!') 

    return connection

}

module.exports = SqlConnection