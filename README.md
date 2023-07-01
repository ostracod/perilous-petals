
# Perilous Petals

A multiplayer flower-based game by Jack Eisenmann

## Requirements

This application has the following system-wide dependencies:

* Node.js version ^16.4
* pnpm version ^8.6
* MySQL version ^8.0

## Installation

To install and run this application:

1. Clone this repository on your machine.
1. Set your working directory to this repository: `cd perilous-petals`
1. Install JavaScript dependencies: `pnpm install`
1. Create the file `ostracodMultiplayerConfig/databaseConfig.json` with the following contents:
    ```
    {
        "host": String (MySQL server address),
        "databaseName": String,
        "username": String,
        "password": String
    }
    ```
1. Set up the Perilous Petals database:
    ```
    node ./node_modules/ostracod-multiplayer/schemaTool.js setup
    ```
1. Copy your `ssl.crt`, `ssl.key`, and `ssl.ca-bundle` files into `ostracodMultiplayerConfig`.
1. Run the Perilous Petals server: `NODE_ENV=production node ./dist/perilousPetals.js`


