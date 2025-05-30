const mysql = require('mysql2/promise')

async function SqlConnection(){
    const connection = await mysql.createConnection({
        host:'localhost',
        user:'root',
        password:'123',
        database:'petfamily'
    })

    console.log('Conectado ao MYSQL!') 

    return connection

}

module.exports = SqlConnection