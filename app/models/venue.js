var mongoose = require('mongoose');

var Picture = require('./picture');

var VenueSchema = new mongoose.Schema({
	fs_id: String,
	name: String,
	updateImages : {type: Boolean, default: false},
	lat: {type: Number, default: 0},
	lon: {type: Number, default: 0}
});

var Venue = mongoose.model('Venue', VenueSchema);

//find picture of venue with best match
Venue.prototype.matchBestImage = function(tag, callback){
	/*var resultMap = {
		'venue_fs_id': this.fs_id,
		'venue_name': this.name
	};*/

	//TODO: we need a more optimal and accurate way to 
	Picture.find({venue_id: this._id})
		.where('usable').equals(true)
		.elemMatch('tags',{'name':tag})
		.sort({'tags.confidence':-1})
		.limit(1)
		.select('fs_id prefix suffix')
		.exec(function(err, pics){
			if(err || pics.length==0){
				callback(null);
			}
			/*
			resultMap['picture_fs_id'] = pics[0].fs_id;
			resultMap['picture_prefix'] = pics[0].prefix;
			resultMap['picture_suffix'] = pics[0].suffix;
			return resultMap; */
			callback(pics[0]);
		});
};

module.exports = Venue;