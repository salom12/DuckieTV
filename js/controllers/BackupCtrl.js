angular.module('DuckieTV.controllers.backup', ['DuckieTV.providers.filereader'])

/**
 * Handles creating and importing a backup.
 *
 * The backup format is a simple JSON file that has the following structure:
 *
 * {
 * "settings": {
 *   // serialized settings
 * },
 * "series": {
 *  <SHOW_TVDB_ID> : [ // array of objects
 *      {
 *          "TVDB_ID": <Episode_TVDB_ID>,
 *          "watchedAt": <timestamp watchedAt>
 *      },
 *      // repeat
 *    ],
 *    // repeat
 *  }
 */
.controller('BackupCtrl', ["$scope", "$rootScope", "FileReader", "TraktTVv2", "SettingsService", "FavoritesService", "$q", function($scope, $rootScope, FileReader, TraktTVv2, SettingsService, FavoritesService, $q) {

    $scope.backupString = false;
    $scope.series = [];
    $scope.adding = {};

    /**
     * Select all series from the database in the format described above, serialize them as a data uri string
     * that's set up on the $scope.backupString, so that it can be used as a trigger for
     * <a ng-if="backupString" download="DuckieTV.backup" ng-href="{{ backupString }}">Backup ready! Click to download.</a>
     */
    $scope.createBackup = function() {
        $scope.backupTime = new Date();
        // Fetch all the series
        CRUD.EntityManager.getAdapter().db.execute('select Series.TVDB_ID from Series').then(function(series) {
            var out = {
                settings: {},
                series: {}
            };
            // Store all the settings
            for (var i = 0; i < localStorage.length; i++) {
                if (localStorage.key(i).indexOf('database.version') > -1) continue;
                out.settings[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
            }
            // Store all the series
            while (serie = series.next()) {
                out.series[serie.get('TVDB_ID')] = [];
            }

            // Store watched episodes for each serie
            CRUD.EntityManager.getAdapter().db.execute('select Series.TVDB_ID, Episodes.TVDB_ID as epTVDB_ID, Episodes.watchedAt from Series left join Episodes on Episodes.ID_Serie = Series.ID_Serie where Episodes.watchedAt is not null').then(function(res) {
                while (row = res.next()) {
                    out.series[row.get('TVDB_ID')].push({
                        'TVDB_ID': row.get('epTVDB_ID'),
                        'watchedAt': new Date(row.get('watchedAt')).getTime()
                    })
                }
                var blob = new Blob([angular.toJson(out, true)], {
                    type: 'text/json'
                });
                $scope.backupString = URL.createObjectURL(blob);

                $scope.$digest();
            });
        });
    }

    $scope.isAdded = function(tvdb_id) {
        return ((tvdb_id in $scope.adding) && ($scope.adding[tvdb_id] === false))
    };

    $scope.isAdding = function(tvdb_id) {
        return ((tvdb_id in $scope.adding) && ($scope.adding[tvdb_id] === true))
    };

    /**
     * Read the backup file and feed it to the FavoritesService to resolve and add.
     * The Favoritesservice has a method to automagically import the watched episodes
     * (which is a bit hacky as it should be part of the import)
     */
    $scope.restore = function() {
        console.log("Import backup!", $scope);
        $scope.adding = {};
        $scope.series = [];
        FileReader.readAsText($scope.file, $scope)
            .then(function(result) {
                result = angular.fromJson(result);
                console.log("Backup read!", result);
                angular.forEach(result.settings, function(value, key) {
                    localStorage.setItem(key, value);
                });
                SettingsService.restore();
                angular.forEach(result.series, function(watched, TVDB_ID) {
                    TraktTVv2.resolveTVDBID(TVDB_ID).then(function(searchResult) {
                        return TraktTVv2.serie(searchResult.slug_id);
                    }).then(function(serie) {
                        $scope.adding[TVDB_ID] = true;
                        $scope.series.push(serie);
                        return FavoritesService.addFavorite(serie, watched);
                    }).then(function() {
                        $scope.adding[TVDB_ID] = false;
                    });
                });
            }, function(err) {
                console.error("ERROR!", err);
            });
    };
}]);
