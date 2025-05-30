require('dotenv').config()

/*  */

const express = require('express')
const app = express()
const port = process.env.PORT
const cors = require('cors')

/*  */

const UsuarioRoute = require('./routes/usuario/UsuarioRoute.js')

const StatusRoute = require('./routes/contrato/StatusRoute.js')
const ContratoRoute = require('./routes/contrato/ContratoRoute.js')
const ContratoServicoRoute = require('./routes/contrato/ContratoServicoRoute.js')

const HospedagemRoute = require('./routes/hospedagem/HospedagemRoute.js')
const ServicoRoute = require('./routes/hospedagem/ServicoRoute.js')

const PetRoute = require('./routes/pet/PetRoute.js')
const PorteRoute = require('./routes/pet/PorteRoute.js')
const EspecieRoute = require('./routes/pet/EspecieRoute.js')
const RacaRoute = require('./routes/pet/RacaRoute.js')

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
    cors(),
    ServicoRoute,
    StatusRoute,
    ContratoRoute,
    ContratoServicoRoute,
    UsuarioRoute,
    PetRoute,
    HospedagemRoute,
    PorteRoute,
    EspecieRoute,
    RacaRoute
)