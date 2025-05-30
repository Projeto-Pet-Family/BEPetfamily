const express = require('express')
const Router = express.Router()
const PorteController = require('../../controllers/pet/PorteController.js')

Router.get('/porte', PorteController.lerPorte)
Router.post('/porte', PorteController.inserirPorte)
Router.put('/porte/:idPorte', PorteController.updatePorte)
Router.delete('/porte/:idPorte', PorteController.deletePorte)

module.exports = Router