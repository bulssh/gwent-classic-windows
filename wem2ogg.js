"use strict"

// Audiokinetic Wwise Vorbis (.wem) -> standard Ogg Vorbis, used to play the original gwent music of
// the player's own copy of The Witcher 3 (read from its soundspc.cache by the desktop app).
//
// The algorithm follows ww2ogg by Adam Gashlin (BSD licence, see licences/ww2ogg.txt): Wwise strips
// the Vorbis headers (codebooks are replaced by ids into a shared codebook library, the other setup
// fields are packed) and the first byte of the audio packets. The standard headers and packets are
// rebuilt here, and the granule positions (sample positions of the Ogg pages) are computed so that
// players know the duration of the track.

const Wem2Ogg = (() => {

	class WemError extends Error {}

	// ---------- bit streams (Vorbis order: least significant bit first) ----------

	class BitReader {
		constructor(bytes) {
			this.bytes = bytes;
			this.bit = 0;
		}
		read(n) {
			let v = 0;
			for (let i = 0; i < n; i++) {
				const byte = this.bit >>> 3;
				if (byte >= this.bytes.length)
					throw new WemError("unexpected end of data");
				if ((this.bytes[byte] >>> (this.bit & 7)) & 1)
					v += 2 ** i; // values up to 32 bits: no bitwise overflow
				this.bit++;
			}
			return v;
		}
	}

	class BitWriter {
		constructor(capacity = 4096) {
			this.bytes = new Uint8Array(capacity);
			this.bit = 0;
		}
		ensure(bits) {
			const need = ((this.bit + bits + 7) >>> 3) + 1;
			if (need > this.bytes.length) {
				const b = new Uint8Array(Math.max(need, this.bytes.length * 2));
				b.set(this.bytes);
				this.bytes = b;
			}
		}
		write(v, n) {
			this.ensure(n);
			for (let i = 0; i < n; i++) {
				if (Math.floor(v / 2 ** i) % 2)
					this.bytes[this.bit >>> 3] |= 1 << (this.bit & 7);
				this.bit++;
			}
		}
		writeBytes(src) {
			this.ensure(src.length * 8);
			const shift = this.bit & 7;
			let k = this.bit >>> 3;
			if (shift === 0) {
				this.bytes.set(src, k);
			} else {
				// unaligned: each byte spans two output bytes
				const bytes = this.bytes;
				for (let i = 0; i < src.length; i++, k++) {
					bytes[k] |= (src[i] << shift) & 0xff;
					bytes[k + 1] = src[i] >>> (8 - shift);
				}
			}
			this.bit += src.length * 8;
		}
		copy(r, n) {
			const v = r.read(n);
			this.write(v, n);
			return v;
		}
		result() {
			return this.bytes.slice(0, (this.bit + 7) >>> 3);
		}
	}

	const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));

	function ilog(v) {
		let r = 0;
		while (v) {
			r++;
			v = Math.floor(v / 2);
		}
		return r;
	}

	function bookMaptype1Quantvals(entries, dimensions) {
		const bits = ilog(entries);
		let vals = Math.floor(entries / 2 ** Math.floor(Math.max(0, bits - 1) * (dimensions - 1) / dimensions));
		for (;;) {
			let acc = 1, acc1 = 1;
			for (let i = 0; i < dimensions; i++) {
				acc *= vals;
				acc1 *= vals + 1;
			}
			if (acc <= entries && acc1 > entries)
				return vals;
			vals += acc > entries ? -1 : 1;
		}
	}

	// ---------- codebook library (packed_codebooks_aoTuV_603.bin) ----------

	class Codebooks {
		constructor(file) {
			const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
			const table = view.getUint32(file.length - 4, true);
			if (table > file.length - 4)
				throw new WemError("bad codebook library");
			this.data = file.subarray(0, table);
			this.offsets = [];
			for (let o = table; o + 4 <= file.length; o += 4)
				this.offsets.push(view.getUint32(o, true));
		}
		get(id) {
			if (id + 1 >= this.offsets.length)
				return null;
			const a = this.offsets[id], b = this.offsets[id + 1];
			if (a > b || b > this.data.length)
				return null;
			return this.data.subarray(a, b);
		}
		// writes the standard Vorbis codebook for the packed codebook id
		rebuild(id, out) {
			const cb = this.get(id);
			if (!cb)
				throw new WemError("invalid codebook id " + id);
			const r = new BitReader(cb);
			const dimensions = r.read(4);
			const entries = r.read(14);
			out.write(0x564342, 24);
			out.write(dimensions, 16);
			out.write(entries, 24);
			const ordered = out.copy(r, 1);
			if (ordered) {
				out.copy(r, 5); // initial length
				let current = 0;
				while (current < entries)
					current += out.copy(r, ilog(entries - current));
				if (current > entries)
					throw new WemError("codebook entry count out of range");
			} else {
				const lengthBits = r.read(3);
				const sparse = r.read(1);
				if (lengthBits === 0 || lengthBits > 5)
					throw new WemError("nonsense codeword length");
				out.write(sparse, 1);
				for (let i = 0; i < entries; i++) {
					const present = sparse ? out.copy(r, 1) : 1;
					if (present)
						out.write(r.read(lengthBits), 5);
				}
			}
			const lookupType = r.read(1);
			out.write(lookupType, 4);
			if (lookupType === 1) {
				out.copy(r, 32); // minimum value
				out.copy(r, 32); // delta value
				const valueLength = out.copy(r, 4);
				out.copy(r, 1); // sequence flag
				const quantvals = bookMaptype1Quantvals(entries, dimensions);
				for (let i = 0; i < quantvals; i++)
					out.copy(r, valueLength + 1);
			}
			if ((r.bit >>> 3) + 1 !== cb.length)
				throw new WemError("codebook size mismatch");
		}
	}

	// ---------- Ogg pages ----------

	const CRC_TABLE = (() => {
		const t = new Uint32Array(256);
		for (let i = 0; i < 256; i++) {
			let r = i << 24;
			for (let k = 0; k < 8; k++)
				r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
			t[i] = r >>> 0;
		}
		return t;
	})();

	function oggCrc(bytes) {
		let crc = 0;
		for (let i = 0; i < bytes.length; i++)
			crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
		return crc;
	}

	class OggWriter {
		constructor(serial) {
			this.pages = [];
			this.size = 0;
			this.seq = 0;
			this.serial = serial;
			this.first = true;
			this.lacing = [];
			this.body = [];
			this.bodySize = 0;
			this.granule = 0;
			this.continued = false;
		}
		flush(last, granule) {
			if (this.lacing.length === 0 && !last)
				return;
			const page = new Uint8Array(27 + this.lacing.length + this.bodySize);
			const view = new DataView(page.buffer);
			page.set(ascii("OggS"), 0);
			page[4] = 0;
			page[5] = (this.continued ? 1 : 0) | (this.first ? 2 : 0) | (last ? 4 : 0);
			if (granule < 0) {
				view.setUint32(6, 0xffffffff, true);
				view.setUint32(10, 0xffffffff, true);
			} else {
				view.setUint32(6, granule % 2 ** 32, true);
				view.setUint32(10, Math.floor(granule / 2 ** 32), true);
			}
			view.setUint32(14, this.serial, true);
			view.setUint32(18, this.seq, true);
			page[26] = this.lacing.length;
			page.set(this.lacing, 27);
			let o = 27 + this.lacing.length;
			for (const b of this.body) {
				page.set(b, o);
				o += b.length;
			}
			view.setUint32(22, oggCrc(page), true);
			this.pages.push(page);
			this.size += page.length;
			this.seq++;
			this.first = false;
			this.lacing = [];
			this.body = [];
			this.bodySize = 0;
			this.continued = false;
		}
		// adds a packet; granule = sample position at the end of the packet
		packet(data, granule, ownPage, last) {
			const segments = Math.floor(data.length / 255) + 1;
			if (this.lacing.length && this.lacing.length + segments > 255)
				this.flush(false, this.granule);
			let pos = 0;
			for (let i = 0; i < segments; i++) {
				if (this.lacing.length === 255) {
					// very long packet: it continues on the next page (no packet ends on this one)
					this.flush(false, -1);
					this.continued = true;
				}
				const s = i + 1 < segments ? 255 : data.length % 255;
				this.lacing.push(s);
				this.body.push(data.subarray(pos, pos + s));
				this.bodySize += s;
				pos += s;
			}
			this.granule = granule;
			if (ownPage || last || this.bodySize >= 4096)
				this.flush(last, granule);
		}
		result() {
			const out = new Uint8Array(this.size);
			let o = 0;
			for (const p of this.pages) {
				out.set(p, o);
				o += p.length;
			}
			return out;
		}
	}

	// ---------- conversion ----------

	// wem, codebookFile: Uint8Array. Returns {ogg: Uint8Array, channels, sampleRate, samples, loopStart, loopEnd}
	function convert(wem, codebookFile) {
		const codebooks = codebookFile instanceof Codebooks ? codebookFile : new Codebooks(codebookFile);
		const view = new DataView(wem.buffer, wem.byteOffset, wem.byteLength);
		const u16 = o => {
			if (o + 2 > wem.length) throw new WemError("truncated");
			return view.getUint16(o, true);
		};
		const u32 = o => {
			if (o + 4 > wem.length) throw new WemError("truncated");
			return view.getUint32(o, true);
		};
		const tag = o => String.fromCharCode(...wem.subarray(o, o + 4));
		if (wem.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
			throw new WemError("not a little-endian RIFF/WAVE file");
		const riffSize = Math.min(u32(4) + 8, wem.length);

		const chunks = {};
		for (let off = 12; off + 8 <= riffSize; ) {
			const size = u32(off + 4);
			chunks[tag(off)] = {offset: off + 8, size};
			off += 8 + size;
		}
		const fmt = chunks["fmt "], data = chunks["data"];
		if (!fmt || !data)
			throw new WemError("missing fmt or data chunk");
		if (data.offset + data.size > wem.length)
			throw new WemError("data chunk truncated");
		let vorbOffset, vorbSize;
		if (chunks["vorb"]) {
			vorbOffset = chunks["vorb"].offset;
			vorbSize = chunks["vorb"].size;
		} else if (fmt.size === 0x42) {
			// recent files: the vorb data is part of an extended fmt chunk
			vorbOffset = fmt.offset + 0x18;
			vorbSize = -1;
		} else {
			throw new WemError("no vorb data");
		}
		if (u16(fmt.offset) !== 0xffff)
			throw new WemError("not Wwise Vorbis");
		const channels = u16(fmt.offset + 2);
		const sampleRate = u32(fmt.offset + 4);
		const avgBytes = u32(fmt.offset + 8);

		let loopStart = null, loopEnd = null;
		if (chunks["smpl"] && u32(chunks["smpl"].offset + 0x1c) === 1) {
			loopStart = u32(chunks["smpl"].offset + 0x2c);
			loopEnd = u32(chunks["smpl"].offset + 0x30);
		}

		const sampleCount = u32(vorbOffset);
		let noGranule, modPackets, setupRel, audioRel, uidPos;
		if (vorbSize === -1 || vorbSize === 0x2a) {
			const modSignal = u32(vorbOffset + 4);
			noGranule = true;
			modPackets = ![0x4a, 0x4b, 0x69, 0x70].includes(modSignal);
			setupRel = u32(vorbOffset + 0x10);
			audioRel = u32(vorbOffset + 0x14);
			uidPos = vorbOffset + 0x24;
		} else if (vorbSize === 0x32 || vorbSize === 0x34) {
			noGranule = false;
			modPackets = false;
			setupRel = u32(vorbOffset + 0x18);
			audioRel = u32(vorbOffset + 0x1c);
			uidPos = vorbOffset + 0x2c;
		} else {
			throw new WemError("unsupported vorb layout");
		}
		if (uidPos + 6 > wem.length)
			throw new WemError("truncated");
		const blocksize0Pow = wem[uidPos + 4], blocksize1Pow = wem[uidPos + 5];
		const headerSize = noGranule ? 2 : 6;
		const audio = wem.subarray(data.offset, data.offset + data.size);
		const audioView = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
		const packetAt = o => {
			if (o + headerSize > audio.length)
				throw new WemError("audio packet header truncated");
			const size = audioView.getUint16(o, true);
			const start = o + headerSize;
			if (start + size > audio.length)
				throw new WemError("audio packet truncated");
			return {start, size};
		};

		const ogg = new OggWriter(1);

		// identification header
		{
			const w = new BitWriter(64);
			w.write(1, 8);
			w.writeBytes(ascii("vorbis"));
			w.write(0, 32);
			w.write(channels, 8);
			w.write(sampleRate, 32);
			w.write(0, 32);
			w.write(avgBytes * 8, 32);
			w.write(0, 32);
			w.write(blocksize0Pow, 4);
			w.write(blocksize1Pow, 4);
			w.write(1, 1);
			ogg.packet(w.result(), 0, true, false);
		}
		// comment header
		{
			const w = new BitWriter(256);
			w.write(3, 8);
			w.writeBytes(ascii("vorbis"));
			const vendor = ascii("Gwent Classic (Wwise Vorbis conversion based on ww2ogg)");
			w.write(vendor.length, 32);
			w.writeBytes(vendor);
			const comments = [];
			if (loopStart !== null) {
				comments.push("LoopStart=" + loopStart);
				comments.push("LoopEnd=" + (loopEnd === 0 ? sampleCount : loopEnd + 1));
			}
			w.write(comments.length, 32);
			for (const c of comments) {
				w.write(c.length, 32);
				w.writeBytes(ascii(c));
			}
			w.write(1, 1);
			ogg.packet(w.result(), 0, false, false);
		}
		// setup header
		let modeBlockflag, modeBits;
		{
			const {start, size} = packetAt(setupRel);
			const r = new BitReader(audio.subarray(start, start + size));
			const w = new BitWriter(8192);
			w.write(5, 8);
			w.writeBytes(ascii("vorbis"));

			const codebookCount = w.copy(r, 8) + 1;
			for (let i = 0; i < codebookCount; i++)
				codebooks.rebuild(r.read(10), w);
			// time domain transforms (placeholder)
			w.write(0, 6);
			w.write(0, 16);

			// floors
			const floorCount = w.copy(r, 6) + 1;
			for (let i = 0; i < floorCount; i++) {
				w.write(1, 16); // always floor type 1
				const partitions = w.copy(r, 5);
				const classes = [];
				let maxClass = 0;
				for (let j = 0; j < partitions; j++) {
					const c = w.copy(r, 4);
					maxClass = Math.max(maxClass, c);
					classes.push(c);
				}
				const dims = [];
				for (let j = 0; j <= maxClass; j++) {
					dims.push(w.copy(r, 3) + 1);
					const subclasses = w.copy(r, 2);
					if (subclasses && w.copy(r, 8) >= codebookCount)
						throw new WemError("invalid floor1 masterbook");
					for (let k = 0; k < (1 << subclasses); k++)
						if (w.copy(r, 8) - 1 >= codebookCount)
							throw new WemError("invalid floor1 subclass book");
				}
				w.copy(r, 2); // multiplier
				const rangebits = w.copy(r, 4);
				for (const c of classes)
					for (let k = 0; k < dims[c]; k++)
						w.copy(r, rangebits);
			}

			// residues
			const residueCount = w.copy(r, 6) + 1;
			for (let i = 0; i < residueCount; i++) {
				const residueType = r.read(2);
				w.write(residueType, 16);
				if (residueType > 2)
					throw new WemError("invalid residue type");
				w.copy(r, 24); // begin
				w.copy(r, 24); // end
				w.copy(r, 24); // partition size
				const classifications = w.copy(r, 6) + 1;
				if (w.copy(r, 8) >= codebookCount)
					throw new WemError("invalid residue classbook");
				const cascade = [];
				for (let j = 0; j < classifications; j++) {
					const low = w.copy(r, 3);
					const high = w.copy(r, 1) ? w.copy(r, 5) : 0;
					cascade.push(high * 8 + low);
				}
				for (const c of cascade)
					for (let k = 0; k < 8; k++)
						if ((c & (1 << k)) && w.copy(r, 8) >= codebookCount)
							throw new WemError("invalid residue book");
			}

			// mappings
			const mappingCount = w.copy(r, 6) + 1;
			for (let i = 0; i < mappingCount; i++) {
				w.write(0, 16); // mapping type 0
				const submaps = w.copy(r, 1) ? w.copy(r, 4) + 1 : 1;
				if (w.copy(r, 1)) {
					const steps = w.copy(r, 8) + 1;
					const bits = ilog(channels - 1);
					for (let j = 0; j < steps; j++) {
						const magnitude = w.copy(r, bits), angle = w.copy(r, bits);
						if (angle === magnitude || magnitude >= channels || angle >= channels)
							throw new WemError("invalid coupling");
					}
				}
				if (w.copy(r, 2) !== 0)
					throw new WemError("mapping reserved field nonzero");
				if (submaps > 1)
					for (let j = 0; j < channels; j++)
						if (w.copy(r, 4) >= submaps)
							throw new WemError("invalid mapping mux");
				for (let j = 0; j < submaps; j++) {
					w.copy(r, 8); // time config
					if (w.copy(r, 8) >= floorCount)
						throw new WemError("invalid floor mapping");
					if (w.copy(r, 8) >= residueCount)
						throw new WemError("invalid residue mapping");
				}
			}

			// modes
			const modeCount = w.copy(r, 6) + 1;
			modeBlockflag = [];
			for (let i = 0; i < modeCount; i++) {
				modeBlockflag.push(w.copy(r, 1) !== 0);
				w.write(0, 16); // window type
				w.write(0, 16); // transform type
				if (w.copy(r, 8) >= mappingCount)
					throw new WemError("invalid mode mapping");
			}
			w.write(1, 1); // framing
			if (((r.bit + 7) >>> 3) !== size)
				throw new WemError("setup packet size mismatch");
			if (start + size !== audioRel)
				throw new WemError("first audio packet does not follow the setup packet");
			modeBits = ilog(modeCount - 1);
			ogg.packet(w.result(), 0, true, false);
		}

		// audio packets
		const modeMask = (1 << modeBits) - 1;
		const blocksize = long => 2 ** (long ? blocksize1Pow : blocksize0Pow);
		let prevBlockflag = false, prevSize = null, granule = 0;
		for (let offset = audioRel; offset < audio.length; ) {
			const {start, size} = packetAt(offset);
			const next = start + size;
			const last = next >= audio.length;
			const payload = audio.subarray(start, next);
			let packet, mode;
			if (modPackets) {
				if (!size)
					throw new WemError("empty audio packet");
				const first = payload[0];
				mode = first & modeMask;
				if (mode >= modeBlockflag.length)
					throw new WemError("invalid mode");
				const long = modeBlockflag[mode];
				const w = new BitWriter(size + 8);
				w.write(0, 1); // audio packet
				w.write(mode, modeBits);
				if (long) {
					let nextLong = false;
					if (next + headerSize <= audio.length) {
						try {
							const n = packetAt(next);
							if (n.size > 0)
								nextLong = !!modeBlockflag[audio[n.start] & modeMask];
						} catch (e) {}
					}
					w.write(prevBlockflag ? 1 : 0, 1);
					w.write(nextLong ? 1 : 0, 1);
				}
				prevBlockflag = long;
				w.write(first >>> modeBits, 8 - modeBits);
				w.writeBytes(payload.subarray(1));
				packet = w.result();
			} else {
				mode = size ? (payload[0] >>> 1) & modeMask : 0;
				packet = payload;
			}
			// granule position: samples completed at the end of this packet
			const bs = blocksize(!!modeBlockflag[mode]);
			if (prevSize !== null)
				granule += prevSize / 4 + bs / 4;
			prevSize = bs;
			ogg.packet(packet, last && sampleCount ? Math.min(granule, sampleCount) : granule, false, last);
			offset = next;
		}
		ogg.flush(false, granule);
		return {ogg: ogg.result(), channels, sampleRate, samples: granule, loopStart, loopEnd};
	}

	return {convert, Codebooks, WemError, OggWriter};
})();

if (typeof module !== "undefined")
	module.exports = Wem2Ogg;
