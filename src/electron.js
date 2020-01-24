const uuid = require('uuid');

const Peer = require('./socket/Peer');
const ifaces = require('os').networkInterfaces();
const electron = require('electron');
const {app, BrowserWindow, Tray, Menu, ipcMain} = electron;
const axios = require('axios');
const path = require('path');
const isDev = require('electron-is-dev');
require('electron-reload')(__dirname);
const fs = require('fs');
const pdf = require('pdf-parse');

let mainWindow;
let tray = null;
let peer = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            devTools: true
        },

    });

    mainWindow.loadURL(
        isDev
            ? 'http://localhost:3000'
            : `file://${path.join(__dirname, '../build/index.html')}`,
    );

    mainWindow.on('closed', () => {
        mainWindow = null
    });

    mainWindow.webContents.openDevTools();

}

const getIpAndMask = () => {
    let ip = null;
    let mask = null;

    Object.keys(ifaces).forEach(function (ifname) {

        ifaces[ifname].forEach(function (iface) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ip = iface.address;
                mask = iface.netmask;
            }
        });
    });

    return {
        ip: ip,
        mask: mask
    }
};

const createTray = () => {
    tray = new Tray('assets/cloud_icon.png');
    const contextMenu = Menu.buildFromTemplate([
        {label: 'Open', click: createWindow},
        {label: 'Quit', click: () => app.quit()},
    ]);

    tray.setToolTip('This is my application.');
    tray.setContextMenu(contextMenu)
};

app.on('ready', () => {
    createTray();
});

ipcMain.on('connectToPearNetwork', ((event) => {
    const {ip, mask} = getIpAndMask();
    let broadcast = ip.split('.');
    console.log(broadcast);
    let finalBroadCast = `${broadcast[0]}.${broadcast[1]}.${broadcast[2]}.255`;

    console.log(ip);
    console.log(finalBroadCast);

    peer = new Peer(ip, finalBroadCast, mainWindow);
    peer.bindPeer();

    setTimeout(() => {
        peer.broadcastMessage();
        // let customPeersList = [peer.peerId, uuid().toString(), uuid().toString()];

        event.sender.send('connectToPearNetworkResponse', {
            peerId: peer.peerId,
        })

    }, 2000);

}));


// ipcMain.on('updatePeerNetwork', ((event, args) => {
//
// }));

ipcMain.on('parseFiles', ((event, args) => {
    args.files.forEach((file) => {
        const path = file.path;
        console.log(path);
        let dataBuffer = fs.readFileSync(path);
        let text;

        pdf(dataBuffer).then((data) => {

            text = data.text.replace(/(^[ \t]*\n)/gm, "");
            let formatted = text.split('.').map((split) => {
                return split.replace(/\s+/g, " ");
            }).join('').replace(/,/g, "").toLocaleLowerCase();
            // console.log(formatted);
            let formattedArray = formatted.split(' ');
            let interestingArray = [];
            for (let i = 0; i < formattedArray.length; i++) {
                if (formattedArray[i].length > 4) {
                    let numberOfOccurrences = 0;
                    for (let j = 0; j < formattedArray.length - 1; j++) {
                        if (formattedArray[i] === formattedArray[j]) {
                            numberOfOccurrences++;
                        }
                    }

                    if (interestingArray.length === 0) {
                        interestingArray.push({
                            word: formattedArray[i],
                            numberOfOccurrences: numberOfOccurrences
                        })
                    } else if (!interestingArray.map(value => value.word).includes(formattedArray[i]) && interestingArray[0].numberOfOccurrences <= numberOfOccurrences) {
                        interestingArray.unshift({
                            word: formattedArray[i],
                            numberOfOccurrences: numberOfOccurrences
                        })
                    }

                    if (interestingArray.length > 5) {
                        interestingArray.pop();
                    }

                }
            }

            console.log(interestingArray.map(value => value.word));
            peer.createJob(formattedArray, interestingArray.map(value => value.word));
            // let array5 = splitToArray(formatted, 5);
            // let array25 = splitToArray(formatted, 25);
        })

    })

}));


const splitToArray = (formattedText, size) => {
    let array = [];
    let words = formattedText.split(' ');
    if (words.length <= size) {
        return [formattedText]
    } else {
        for (let i = 0; i < words.length - size; i++) {
            array.push(words.slice(i, i + size).join(' '))
        }
        return array;
    }
};

const getWikiContent = (word) => {
    const searchUrl = `https://pl.wikipedia.org/w/api.php?format=json&action=opensearch&search=${word}`;
    const contentUrl = `https://pl.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&format=json&titles=`;

    axios.get(searchUrl)
        .then(res => {
            let arrayOfTitles = res.data[1];
            // console.log(res.data[1]);
            arrayOfTitles.forEach(title => {
                const parsedContentUrl = encodeURI(contentUrl + title.replace(/\s+/g, '_'));
                axios.get(parsedContentUrl)
                    .then(res => {
                        const pages = res.data.query.pages;
                        const pageId = Object.keys(pages)[0];
                        // console.log(pageId);
                        // console.log(Object.keys(pages));
                        console.log(pages[pageId].revisions[0]['*']
                            .replace(/<(\w+)+>[^<]*<\/\1>/g, '')
                            .replace(/\[\[[^\|]*\||\]\]|'''/g, '')
                            .replace(/<!--|-->|:|(^[ \t]*\n)|==[^\]]*/g, '')
                            .replace(/\[\[|{{|}}/g, '')
                            .replace(/\|/g, ' ')
                            .replace(/\s\s/g, ' ')
                            .replace(', )', ')')
                            .replace(/Dopracować.*/g, '')
                            .replace(/(^[ \t]*\n)/g, '')
                        );
                        console.log()

                    })
            });

        })

};

// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') {
//         app.quit()
//     }
// });

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow()
    }
});