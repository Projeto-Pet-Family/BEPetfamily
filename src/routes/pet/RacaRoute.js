const express = require('express')
const Router = express.Router()
const RacaController = require('../../controllers/pet/RacaController.js')

Router.get('/raca', RacaController.lerRaca)
Router.get('/raca/especie/:idEspecie', RacaController.lerRacaPorEspecie)
Router.post('/raca', RacaController.inserirRaca)
Router.put('/raca/:idRaca', RacaController.updateRaca)
Router.delete('/raca/:idRaca', RacaController.deleteRaca)

module.exports = Router