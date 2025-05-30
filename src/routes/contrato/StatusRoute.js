const express = require('express')
const Router = express.Router()
const StatusController = require('../../controllers/contrato/StatusController.js')

Router.get('/status', StatusController.lerStatus)
Router.post('/status', StatusController.inserirStatus)
Router.put('/status/:idStatus', StatusController.updateStatus)
Router.delete('/status/:idStatus', StatusController.deleteStatus)

module.exports = Router