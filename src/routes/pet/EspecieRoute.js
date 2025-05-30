
const express = require('express')
const Router = express.Router()
const EspecieController = require('../../controllers/pet/EspecieController.js')

Router.get('/especie', EspecieController.lerEspecie)
Router.post('/especie', EspecieController.inserirEspecie)
Router.put('/especie/:idEspecie', EspecieController.updateEspecie)
Router.delete('/especie/:idEspecie', EspecieController.deleteEspecie)

module.exports = Router