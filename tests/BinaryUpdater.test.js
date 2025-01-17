const BinaryUpdater = require("../modules/BinaryUpdater");
const fs = require("fs");
const axios = require("axios");
const { PassThrough } = require('stream');

beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn().mockImplementation(() => {});
    console.log = jest.fn().mockImplementation(() => {});
})

describe("writeVersionInfo", () => {
    it('writes the version to a file', () => {
        jest.spyOn(fs.promises, 'writeFile').mockResolvedValue("");
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        instance.writeVersionInfo("v2.0.0-test1");
        expect(fs.promises.writeFile).toBeCalledTimes(1);
        expect(fs.promises.writeFile).toBeCalledWith("a/test/path", "{\"version\":\"v2.0.0-test1\"}");
    });
});

describe("getLocalVersion", () => {
    it('returns null when when the file does not exist', () => {
        jest.spyOn(fs.promises, 'readFile').mockRejectedValue("ENOTFOUND");
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        return instance.getLocalVersion().then((data) => {
            expect(data).toBe(null);
        });
    });
    it('returns the version property from the json file', () => {
        jest.spyOn(fs.promises, 'readFile').mockResolvedValue("{\"version\": \"v2.0.0-test1\"}")
        const instance = new BinaryUpdater({ ytdlVersion: "a/test/path" });
        return instance.getLocalVersion().then((data) => {
            expect(data).toBe("v2.0.0-test1");
        });
    });
});

describe('getRemoteVersion', () => {
    it('returns a null array when not redirected', () => {
        const axiosGetSpy = jest.spyOn(axios, 'get').mockRejectedValue({response: {status: 200}});
        const instance = new BinaryUpdater({platform: "win32"});
        return instance.getRemoteVersion().then((data) => {
            expect(data).toEqual([null, null]);
            expect(axiosGetSpy).toBeCalledTimes(1);
        });
    });
    it('returns a null array on error', () => {
        const axiosGetSpy = jest.spyOn(axios, 'get').mockRejectedValue({response: null});
        const instance = new BinaryUpdater({platform: "darwin"});
        return instance.getRemoteVersion().then((data) => {
            expect(data).toEqual([null, null]);
            expect(axiosGetSpy).toBeCalledTimes(1);
        });
    });
    it('returns array with the link and the version', () => {
        const redirectURL = "http://yt-dl.org/downloads/2021.03.14/youtube-dl.exe"
        const axiosGetSpy = jest.spyOn(axios, 'get').mockRejectedValue({response: {status: 302, headers: {location: redirectURL}}});
        const instance = new BinaryUpdater({platform: "win32"});
        return instance.getRemoteVersion().then((data) => {
            expect(data).toEqual([redirectURL, "2021.03.14"]);
            expect(axiosGetSpy).toBeCalledTimes(1);
        });
    });
});

describe('checkUpdate', () => {
    it('does nothing when local and remote version are the same', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate');
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("v2.0.0");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue(["link", "v2.0.0"]);
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).not.toBeCalled();
            expect(instance.win.webContents.send).not.toBeCalled();
        });
    });
    it('does nothing when remote version returned null', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate');
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("v2.0.0");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue([null, null]);
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).not.toBeCalled();
            expect(instance.win.webContents.send).not.toBeCalled();
        });
    });
    it('downloads the latest remote version when local version is null', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate').mockResolvedValue("");
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue(null);
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue(["link", "v2.0.0"]);
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).toBeCalledTimes(1);
            expect(instance.win.webContents.send).toBeCalledTimes(1);
        });
    });
    it('downloads the latest remote version when local version is different', () => {
        const win = {webContents: {send: jest.fn()}};
        const instance = new BinaryUpdater({platform: "win32", ytdl: "a/path/to"}, win);
        const downloadUpdateSpy = jest.spyOn(instance, 'downloadUpdate').mockResolvedValue("");
        jest.spyOn(instance, 'getLocalVersion').mockResolvedValue("v1.8.7");
        jest.spyOn(instance, 'getRemoteVersion').mockResolvedValue(["link", "v2.0.0"]);
        return instance.checkUpdate().then(() => {
            expect(downloadUpdateSpy).toBeCalledTimes(1);
            expect(instance.win.webContents.send).toBeCalledTimes(1);
        });
    });
});

describe("downloadUpdate", () => {
    it('does not write version info and rejects on error', async () => {
        const mockReadable = new PassThrough();
        const mockWriteable = new PassThrough();
        jest.spyOn(fs, 'createWriteStream').mockReturnValueOnce(mockWriteable);
        jest.spyOn(axios, 'get').mockResolvedValue({ data: mockReadable });
        setTimeout(() => {
            mockWriteable.emit('error', "Test error");
        }, 100);
        const instance = new BinaryUpdater({platform: "win32"});
        const versionInfoSpy = jest.spyOn(instance, 'writeVersionInfo').mockImplementation(() => {});
        const actualPromise = instance.downloadUpdate("link", "v2.0.0");
        await expect(actualPromise).rejects.toEqual("Test error");
        expect(versionInfoSpy).not.toBeCalled();
    });
    it('writes version info and resolves when successful', async () => {
        const mockReadable = new PassThrough();
        const mockWriteable = new PassThrough();
        jest.spyOn(fs, 'createWriteStream').mockReturnValueOnce(mockWriteable);
        jest.spyOn(axios, 'get').mockResolvedValue({ data: mockReadable });
        setTimeout(() => {
            mockWriteable.emit('close');
        }, 100);
        const instance = new BinaryUpdater({platform: "win32"});
        const versionInfoSpy = jest.spyOn(instance, 'writeVersionInfo').mockImplementation(() => {});
        const actualPromise = instance.downloadUpdate("link", "v2.0.0");
        await expect(actualPromise).resolves.toBeTruthy();
        expect(versionInfoSpy).toBeCalledWith("v2.0.0");
    });
});
