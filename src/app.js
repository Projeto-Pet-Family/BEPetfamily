require('dotenv').config()

/*  */

const express = require('express')
const app = express()
const port = process.env.PORT

/*  */

const ServicoRoute = require('./routes/ServicoRoute.js')
const StatusRoute = require('./routes/StatusRoute.js')
const ContratoRoute = require('./routes/ContratoRoute.js')
const ContratoServicoRoute = require('./routes/ContratoServicoRoute.js')

/*  */

app.listen(port,() => {
    console.log(`Servidor aberto -> http://localhost:${port}`)
})

app.get('/', (req,res) => {
    res.send('petfamily')
})

/*  */

app.use(express.json())

app.use(
    ServicoRoute,
    StatusRoute,
    ContratoRoute,
    ContratoServicoRoute
)